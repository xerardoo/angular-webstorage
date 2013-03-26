var storage = angular.module('webstorage', []);
// Prefix for all cache keys
storage.constant('cachePrefix', 'angular-web-storage-');
// Suffix for the key name on the expiration items in localStorage
storage.constant('cacheSuffix', '-cacheexpiration');
// expiration date radix (set to Base-36 for most space savings)
storage.constant('expiryRadix', 10);
// time resolution in minutes
storage.constant('expiryUnits', 60 * 1000);
// ECMAScript max Date (epoch + 1e8 days)
storage.constant('maxDate', Math.floor(8.64e15/(60 * 1000)));
storage.value('scopes', []);
storage.value('cachedStorage', undefined);
storage.value('cacheBucket', "");
storage.value('cachedJSON', "");

//storage.value('cachedStorage', undefined);
storage.run(function(WebStorage, scopes, cachedStorage){
	// Example call for run method, maybe I can clean the store here o load it.
	if (cachedStorage = WebStorage.supported())
		console.log("Funca");
});

/**
 * Storage Service
 * @param (angular.Scope) $rootScope The scope that we'll $digest
 * @param (angular.q) $q The Angular promise service.
 * @param (angular.log) $log The Angular logging service.
 * @constructor
 */

storage.WebStorage = function($rootScope, $q, $log){
	this.scope = $rootScope;
	this.log = $log;
	this.q = $q;
	this.loaded = this.q.defer();
	this.ready = this.loaded.promise;
};

storage.service('WebStorage', storage.WebStorage);

// /**
//  * Stores the value in localStorage. Expires after specified number of minutes.
//  * @param {string} key
//  * @param {Object|string} value
//  * @param {number} time
//  */
storage.WebStorage.prototype.set = function(key, value, time) {
  if (!supportsStorage()) {
  	console.log("not supported");
  	return;
  }
  // If we don't get a string value, try to stringify
  // In future, localStorage may properly support storing non-strings
  // and this can be removed.
  if (typeof value !== 'string') {
    if (!supportsJSON()) return;
    try {
      value = JSON.stringify(value);
    } catch (e) {
      // Sometimes we can't stringify due to circular refs
      // in complex objects, so we won't bother storing then.
      return;
    }
  }
  try {
    setItem(key, value);
  } catch (e) {
    if (e.name === 'QUOTA_EXCEEDED_ERR' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      // If we exceeded the quota, then we will sort
      // by the expire time, and then remove the N oldest
      var storedKeys = [];
      var storedKey;
      for (var i = 0; i < localStorage.length; i++) {
        storedKey = localStorage.key(i);
        if (storedKey.indexOf(cachePrefix + cacheBucket) === 0 && storedKey.indexOf(cacheSuffix) < 0) {
          var mainKey = storedKey.substr((cachePrefix + cacheBucket).length);
          var exprKey = expirationKey(mainKey);
          var expiration = getItem(exprKey);
          if (expiration) {
            expiration = parseInt(expiration, expiryRadix);
          } else {
            // TODO: Store date added for non-expiring items for smarter removal
            expiration = MAX_DATE;
          }
          storedKeys.push({
            key: mainKey,
            size: (getItem(mainKey)||'').length,
            expiration: expiration
          });
        }
      }
      // Sorts the keys with oldest expiration time last
      storedKeys.sort(function(a, b) { return (b.expiration-a.expiration); });
      var targetSize = (value||'').length;
      while (storedKeys.length && targetSize > 0) {
        storedKey = storedKeys.pop();
        removeItem(storedKey.key);
        removeItem(expirationKey(storedKey.key));
        targetSize -= storedKey.size;
      }
      try {
        setItem(key, value);
      } catch (e) {
        // value may be larger than total quota
        return;
      }
    } else {
      // If it was some other error, just give up.
      return;
    }
  }
  // If a time is specified, store expiration info in localStorage
  if (time) {
    setItem(expirationKey(key), (currentTime() + time).toString(expiryRadix));
  } else {
    // In case they previously set a time, remove that info from localStorage.
    removeItem(expirationKey(key));
  }
}

// /**
//  * Retrieves specified value from localStorage, if not expired.
//  * @param {string} key
//  * @return {string|Object}
//  */
storage.WebStorage.prototype.get = function(key) {
  if (!supportsStorage()) return null;
  // Return the de-serialized item if not expired
  var exprKey = expirationKey(key);
  var expr = getItem(exprKey);
  if (expr) {
    var expirationTime = parseInt(expr, expiryRadix);

    // Check if we should actually kick item out of storage
    if (currentTime() >= expirationTime) {
      removeItem(key);
      removeItem(exprKey);
      return null;
    }
  }
  // Tries to de-serialize stored value if its an object, and returns the normal value otherwise.
  var value = getItem(key);
  if (!value || !supportsJSON()) {
    return value;
  }
  try {
    // We can't tell if its JSON or a string, so we try to parse
    return JSON.parse(value);
  } catch (e) {
    // If we can't parse, it's probably because it isn't an object
    return value;
  }
}


/**
 * Removes a value from localStorage.
 * Equivalent to 'delete' in memcache, but that's a keyword in JS.
 * @param {string} key
 */
storage.Storage.prototype.remove = function(key) {
  if (!supportsStorage()) return null;
  removeItem(key);
  removeItem(expirationKey(key));
}

/**
 * Returns whether local storage is supported.
 * Currently exposed for testing purposes.
 * @return {boolean}
 */
storage.WebStorage.prototype.supported = function() {
  return supportsStorage();
}

/**
 * Flushes all lscache items and expiry markers without affecting rest of localStorage
 */
storage.Storage.prototype.flush = function() {
  if (!supportsStorage()) return;
  // Loop in reverse as removing items will change indices of tail
  for (var i = localStorage.length-1; i >= 0 ; --i) {
    var key = localStorage.key(i);
    if (key.indexOf(storage.cachePrefix + storage.cacheBucket) === 0) {
      localStorage.removeItem(key);
    }
  }
}

/**
 * Appends CACHE_PREFIX so lscache will partition data in to different buckets.
 * @param {string} bucket
 */
storage.Storage.prototype.setBucket = function(bucket) {
  storage.cacheBucket = bucket;
}

/**
 * Resets the string being appended to CACHE_PREFIX so lscache will use the default storage behavior.
 */
storage.Storage.prototype.resetBucket = function() {
  storage.cacheBucket = '';
}



// Determines if localStorage is supported in the browser;
// result is cached for better performance instead of being run each time.
// Feature detection is based on how Modernizr does it;
// it's not straightforward due to FF4 issues.
// It's not run at parse-time as it takes 200ms in Android.

function supportsStorage(){
	var key = '__storagetest__';
  var value = key;
  if (storage.cachedStorage !== undefined) {
    return storage.cachedStorage;
  }
  try {
    setItem(key, value);
    removeItem(key);
    storage.cachedStorage = true;
  } catch (exc) {
    storage.cachedStorage = false;
  }
  return storage.cachedStorage;
}
// Determines if native JSON (de-)serialization is supported in the browser.
function supportsJSON() {
  /*jshint eqnull:true */
  if (storage.cachedJSON === undefined) {
    storage.cachedJSON = (window.JSON != null);
  }
  return storage.cachedJSON;
}

/**
 * Returns the full string for the localStorage expiration item.
 * @param {String} key
 * @return {string}
 */
function expirationKey(key) {
  return key + storage.cacheSuffix;
}

/**
 * Returns the number of minutes since the epoch.
 * @return {number}
 */
function currentTime() {
  return Math.floor((new Date().getTime())/storage.expiryUnits);
}

/**
 * Wrapper functions for localStorage methods
 */

function getItem(key) {
  return localStorage.getItem(cachePrefix + storage.cacheBucket + key);
}

function setItem(key, value) {
  // Fix for iPad issue - sometimes throws QUOTA_EXCEEDED_ERR on setItem.
  localStorage.removeItem(storage.cachePrefix + storage.cacheBucket + key);
  localStorage.setItem(storage.cachePrefix + storage.cacheBucket + key, value);
}

function removeItem(key) {
  localStorage.removeItem(storage.cachePrefix + storage.cacheBucket + key);
}

