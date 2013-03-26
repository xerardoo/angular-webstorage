angular-webstorage
==================

WebStorage AngularJS module to work with browsers localStorage and sessionStorage.

This module is based on [lscache](http://github.com/pamelafox/lscache) (A localStorage-based memcache-inspired client-side caching library. ).

Usage
-----
 1. You need to include the 'webstorage' in your app.
 2. Include the 'WebStorage' where you want to use it.
 3. Use it.

Methods
-------
#### set
Stores the value in localStorage. Expires after specified number of minutes.
##### Arguments
1. `key` (**string**)
2. `value` (**Object|string**)
3. `time` (**number: optional**)

```js
WebStorage.set(key, value, time);
```
#### get
Retrieves specified value from localStorage, if not expired.
##### Arguments
1. `key` (**string**)

```js
WebStorage.get(key);
```

#### remove
Removes a value from localStorage.
##### Arguments
1. `key` (**string**)

```js
WebStorage.remove(key);
```

#### supported
Check if localStorage is supported in the current browser.

```js
WebStorage.supported();
```

#### flush
Removes all WebStorage items from localStorage without affecting other data.

```js
WebStorage.flush();
```

#### setBucket
Appends CACHE_PREFIX so WebStorage will partition data in to different buckets
##### Arguments
1. `bucketName` (**string**)

```js
WebStorage.setBucket(bucketName);
```

#### resetBucket

```js
WebStorage.resetBucket();
```





Browser support:
---------------
You can find a list of brownser support here: http://www.quirksmode.org/dom/html5.html