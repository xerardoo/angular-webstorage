var storage = angular.module('webstorage', []);

storage.factory('WStorage', function(cachedStorage, cachePrefix, cacheBucket, cachedJSON, warnings) {
    return function(iCachedStorage, iCachePrefix, iCacheBucket, iCachedJSON, iWarnings) {
        this.cachedStorage  = iCachedStorage;
        this.cachePrefix    = iCachePrefix;
        this.cacheBucket    = iCacheBucket;
        this.cachedJSON     = iCachedJSON;
        this.warnings     = iWarnings;
        this.setWarnings = function(enabled){
            this.warnings = enabled;
        }
        this.setCacheBucket = function(cacheBucket){
            this.cacheBucket = cacheBucket;
        }
        this.getCachePrefix = function(){
            return this.cachePrefix;
        }
        this.getCacheBucket = function(){
            return this.cacheBucket;
        }
        /**
         * Determines if localStorage is supported in the browser;
         * result is cached for better performance instead of being run each time.
         * Feature detection is based on how Modernizr does it;
         * it's not straightforward due to FF4 issues.
         * It's not run at parse-time as it takes 200ms in Android.
         */
        this.supportsStorage = function(){
            var key = '__storagetest__';
            var value = key;
            if (this.cachedStorage !== undefined) {
                return this.cachedStorage;
            }
            try {
                this.setItem(key, value);
                this.removeItem(key);
                this.cachedStorage = true;
            } catch (exc) {
                this.cachedStorage = false;
            }
            return this.cachedStorage;
        };
        // Determines if native JSON (de-)serialization is supported in the browser.
        this.supportsJSON = function() {
            /*jshint eqnull:true */
            if (this.cachedJSON === undefined) {
                this.cachedJSON = (window.JSON != null);
            }
            return this.cachedJSON;
        };
        /**
         * Returns the full string for the localStorage expiration item.
         * @param {String} key
         * @return {string}
         */
        this.expirationKey = function(key) {
            return key + this.cacheSuffix;
        };
        /**
         * Returns the number of minutes since the epoch.
         * @return {number}
         */
        this.currentTime = function() {
            return Math.floor((new Date().getTime())/this.expiryUnits);
        };
        /**
         * Wrapper functions for localStorage methods
         */
        this.getItem = function(key) {
            return localStorage.getItem(this.cachePrefix + this.cacheBucket + key);
        }
        this.setItem = function(key, value) {
            // Fix for iPad issue - sometimes throws QUOTA_EXCEEDED_ERR on setItem.
            localStorage.removeItem(this.cachePrefix + this.cacheBucket + key);
            localStorage.setItem(this.cachePrefix + this.cacheBucket + key, value);
        }
        this.removeItem = function(key) {
            localStorage.removeItem(this.cachePrefix + this.cacheBucket + key);
        }
        this.cleanStorage = function(){
            localStorage.clear();
        }
        this.warn = function(message, err) {
            if (!this.warnings) return;
            if (!'console' in window || typeof window.console.warn !== 'function') return;
            window.console.warn("lscache - " + message);
            if (err) window.console.warn("lscache - The error was: " + err.message);
        }
    };
});

// Prefix for all cache keys
storage.constant('cachePrefix', 'angular-webstorage-');
// Suffix for the key name on the expiration items in localStorage
storage.constant('cacheSuffix', '-cacheexpiration');
// expiration date radix (set to Base-36 for most space savings)
storage.constant('expiryRadix', 10);
// time resolution in minutes
storage.constant('expiryUnits', 60000);
// ECMAScript max Date (epoch + 1e8 days)
storage.constant('maxDate', Math.floor(8.64e15/60000));
storage.value('scopes', []);
storage.value('cachedStorage', undefined);
storage.value('cacheBucket', "");
storage.value('cachedJSON', undefined);
storage.value('warnings', false);
storage.value('iWStorage', undefined);

//storage.value('cachedStorage', undefined);
storage.run(function(WebStorage, scopes, cachedStorage, cachePrefix, cacheBucket, cachedJSON, WStorage){
    //Factory
    iWStorage = new WStorage(cachedStorage, cachePrefix, cacheBucket, cachedJSON);
    //service call
    if (WebStorage.supported())
        WebStorage.log.log("WebStorage supported")
    else
        WebStorage.log.log("WebStorage not supported")
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

/**
 * Stores the value in localStorage. Expires after specified number of minutes.
 * @param {string} key
 * @param {Object|string} value
 * @param {number} time
 */
storage.WebStorage.prototype.set = function(key, value, time) {
    if (!iWStorage.supportsStorage()) return;
    // If we don't get a string value, try to stringify
    // In future, localStorage may properly support storing non-strings
    // and this can be removed.

    if (typeof value !== 'string') {
        if (!iWStorage.supportsJSON()) return;
        try {
            value = JSON.stringify(value);
        } catch (e) {
            // Sometimes we can't stringify due to circular refs
            // in complex objects, so we won't bother storing then.
            return;
        }
    }
    try {
        iWStorage.setItem(key, value);
    } catch (e) {
        if (e.name === 'QUOTA_EXCEEDED_ERR' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.name === 'QuotaExceededError') {
            // If we exceeded the quota, then we will sort
            // by the expire time, and then remove the N oldest
            var storedKeys = [];
            var storedKey;
            for (var i = 0; i < localStorage.length; i++) {
                storedKey = localStorage.key(i);
                if (storedKey.indexOf(cachePrefix + cacheBucket) === 0 && storedKey.indexOf(cacheSuffix) < 0) {
                    var mainKey = storedKey.substr((cachePrefix + cacheBucket).length);
                    var exprKey = expirationKey(mainKey, storage.cacheSuffix);
                    var expiration = iWStorage.getItem(exprKey);
                    if (expiration) {
                        expiration = parseInt(expiration);
                    } else {
                        // TODO: Store date added for non-expiring items for smarter removal
                        expiration = MAX_DATE;
                    }
                    storedKeys.push({
                        key: mainKey,
                        size: (iWStorage.getItem(mainKey)||'').length,
                        expiration: expiration
                    });
                }
            }
            // Sorts the keys with oldest expiration time last
            storedKeys.sort(function(a, b) { return (b.expiration-a.expiration); });
            var targetSize = (value||'').length;
            while (storedKeys.length && targetSize > 0) {
                storedKey = storedKeys.pop();
                iWStorage.warn("Cache is full, removing item with key '" + storedKey.key + "'");
                iWStorage.removeItem(storedKey.key);
                iWStorage.removeItem(expirationKey(storedKey.key));
                targetSize -= storedKey.size;
            }
            try {
                iWStorage.setItem(key, value);
            } catch (e) {
                // value may be larger than total quota
                iWStorage.warn("Could not add item with key '" + storedKey.key + "', perhaps it's too big?", e);
                return;
            }
        } else {
            // If it was some other error, just give up.
            iWStorage.warn("Could not add item with key '" + key + "'", e);
            return;
        }
    }
    // If a time is specified, store expiration info in localStorage
    if (time) {
        iWStorage.setItem(expirationKey(key), (iWStorage.currentTime() + time).toString(expiryRadix));
    } else {
        // In case they previously set a time, remove that info from localStorage.
        iWStorage.removeItem(iWStorage.expirationKey(key));
    }
}

/**
 * Retrieves specified value from localStorage, if not expired.
 * @param {string} key
 * @return {string|Object}
 */
storage.WebStorage.prototype.get = function(key) {
    if (!iWStorage.supportsStorage()) return null;
    // Return the de-serialized item if not expired
    var exprKey = iWStorage.expirationKey(key);
    var expr = iWStorage.getItem(exprKey);
    if (expr) {
        var expirationTime = parseInt(expr);

        // Check if we should actually kick item out of storage
        if (iWStorage.currentTime() >= expirationTime) {
            iWStorage.removeItem(key);
            iWStorage.removeItem(exprKey);
            return null;
        }
    }
    // Tries to de-serialize stored value if its an object, and returns the normal value otherwise.
    var value = iWStorage.getItem(key);
    if (!value || !iWStorage.supportsJSON()) {
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
storage.WebStorage.prototype.remove = function(key) {
    if (!iWStorage.supportsStorage()) return null;
    iWStorage.removeItem(key);
    iWStorage.removeItem(iWStorage.expirationKey(key));
}

/**
 * Returns whether local storage is supported.
 * Currently exposed for testing purposes.
 * @return {boolean}
 */
storage.WebStorage.prototype.supported = function() {
    return iWStorage.supportsStorage();
}

/**
 * Flushes all lscache items and expiry markers without affecting rest of localStorage
 */
storage.WebStorage.prototype.flush = function() {
    if (!iWStorage.supportsStorage()) return;
    // Loop in reverse as removing items will change indices of tail
    for (var i = localStorage.length-1; i >= 0 ; --i) {
        var key = localStorage.key(i);
        if (key.indexOf(iWStorage.getCachePrefix() + iWStorage.getCacheBucket()) === 0) {
            iWStorage.removeItem(key);
        }
    }
}

/**
 * Appends CACHE_PREFIX so lscache will partition data in to different buckets.
 * @param {string} bucket
 */
storage.WebStorage.prototype.setBucket = function(bucket) {
    iWStorage.setCacheBucket(bucket);
}

/**
 * Resets the string being appended to CACHE_PREFIX so lscache will use the default storage behavior.
 */
storage.WebStorage.prototype.resetBucket = function() {
    iWStorage.setCacheBucket('');
}

/**
 * Sets whether to display warnings when an item is removed from the cache or not.
 */
storage.WebStorage.prototype.enableWarnings = function(enabled) {
    iWStorage.setWarnings(enabled);
}

/**
 * Resets all the localStorage.
 */
storage.WebStorage.prototype.cleanStorage = function() {
    // console.log("iWStorage.cleanStorage()",iWStorage.cleanStorage());
    console.log("iWStorage.cleanStorage()");
    iWStorage.cleanStorage();
}
