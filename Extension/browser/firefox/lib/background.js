/**
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Adguard Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global Components */

(function (global) {

    'use strict';

    var Cc = global.Cc = Components.classes;
    var Cu = global.Cu = Components.utils;
    var Ci = global.Ci = Components.interfaces;
    global.Cr = Components.results;
    global.Cm = Components.manager;
    global.components = Components;

    var Services = global.Services = Cu.import("resource://gre/modules/Services.jsm").Services;
    var NetUtil = global.NetUtil = Cu.import("resource://gre/modules/NetUtil.jsm").NetUtil;
    global.XPCOMUtils = Cu.import("resource://gre/modules/XPCOMUtils.jsm").XPCOMUtils;
    global.FileUtils = Cu.import("resource://gre/modules/FileUtils.jsm").FileUtils;

    function getQueryVariable(variable) {
        var query = window.location.search.substring(1);
        var vars = query.split('&');
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split('=');
            if (pair[0] == variable) {
                return decodeURIComponent(pair[1]);
            }
        }
    }

    // Iframe is loaded with src=chrome://adguard/content/background.html?id={id}&version=version
    var options = {
        id: getQueryVariable('id'),
        version: getQueryVariable('version')
    };

    var id = options.id;
    var version = options.version;

    var adguard = global.adguard = {};

    adguard.extension = (function () {

        function readURISync(uri) {

            var charset = 'UTF-8';

            var channel = NetUtil.newChannel(uri, charset, null);
            var stream = channel.open();

            var count = stream.available();
            var data = NetUtil.readInputStreamToString(stream, count, {charset: charset});

            stream.close();

            return data;
        }

        var uri = function (path) {
            return path.contains(":") ? path : 'chrome://adguard/' + path.replace(/^\.\//, "");
        };

        var getId = function () {
            return id;
        };

        var getVersion = function () {
            return version;
        };

        var load = function (path) {
            return readURISync(uri(path));
        };

        return {
            getId: getId,
            getVersion: getVersion,
            load: load,
            url: uri
        };

    })();

    adguard.runtime = (function () {

        /**
         * The XUL application's version, for example "0.8.0+" or "3.7a1pre".
         */
        var getVersion = function () {
            return Services.appinfo.version;
        };

        /**
         * What platform you're running on (all lower case string).
         * For possible values see:
         * https://developer.mozilla.org/en/OS_TARGET
         */
        var getPlatform = function () {
            return Services.appinfo.OS.toLowerCase();
        };

        return {
            getVersion: getVersion,
            getPlatform: getPlatform
        };

    })();

    global.SimplePrefs = (function () {

        var branch = Services.prefs.getBranch('extensions.' + id + '.sdk.');

        var get = function (name, defaultValue) {
            var prefType = branch.getPrefType(name);
            switch (prefType) {
                case Ci.nsIPrefBranch.PREF_STRING:
                    return branch.getComplexValue(name, Ci.nsISupportsString).data;
                case Ci.nsIPrefBranch.PREF_INT:
                    return branch.getIntPref(name);
                case Ci.nsIPrefBranch.PREF_BOOL:
                    return branch.getBoolPref(name);
                case Ci.nsIPrefBranch.PREF_INVALID:
                    return defaultValue;
                default:
                    // This should never happen.
                    throw new Error("Error getting pref " + name + "; its value's type is " + prefType + ", which I don't know how to handle.");
            }
        };

        var set = function (name, value) {

            var prefType;
            if (typeof value !== "undefined" && value !== null) {
                prefType = value.constructor.name;
            }

            switch (prefType) {
                case "String":
                    var string = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
                    string.data = value;
                    branch.setComplexValue(name, Ci.nsISupportsString, string);
                    break;
                case "Number":
                    branch.setIntPref(name, value);
                    break;
                case "Boolean":
                    branch.setBoolPref(name, value);
                    break;
                default:
                    throw new Error("can't set pref " + name + " to value '" + value + "'; it isn't a string, integer, or boolean");
            }
        };

        var has = function (name) {
            return branch.prefHasUserValue(name);
        };

        var remove = function (name) {
            branch.clearUserPref(name);
        };

        var clear = function () {
            branch.deleteBranch('');
        };

        // https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Preferences
        var myObserver = {
            observe: function (subject, topic, data) {
                if (topic === 'nsPref:changed') {
                    var channel = EventChannels.getNamedChannel(data);
                    if (channel) {
                        channel.notify(data);
                    }
                }
            }
        };

        var addListener = function (name, callback) {
            branch.addObserver(name, myObserver, false);
            var channel = EventChannels.newNamedChannel(name);
            channel.addListener(callback);
        };

        var removeListener = function (name, callback) {
            branch.removeObserver(name, myObserver);
            var channel = EventChannels.getNamedChannel(name);
            if (channel) {
                channel.removeListener(callback);
            }
        };

        return {
            get: get,
            set: set,
            has: has,
            remove: remove,
            clear: clear,
            addListener: addListener,
            removeListener: removeListener
        };

    })();

    //(function (global) {
    //
    //    var lastTimerId = 1;
    //    var timers = Object.create(null);
    //
    //    var TYPE_ONE_SHOT = Ci.nsITimer.TYPE_ONE_SHOT;
    //
    //    function setTimer(type, callback, delay) {
    //        var id = ++lastTimerId;
    //        var timer = timers[id] = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    //        timer.initWithCallback({
    //            notify: function () {
    //                try {
    //                    if (type === TYPE_ONE_SHOT) {
    //                        delete timers[id];
    //                    }
    //                    callback.apply(null);
    //                } catch (error) {
    //                    console.exception(error);
    //                }
    //            }
    //        }, Math.max(delay || 4), type);
    //        return id;
    //    }
    //
    //    function unsetTimer(id) {
    //        var timer = timers[id];
    //        delete timers[id];
    //        if (timer) {
    //            timer.cancel();
    //        }
    //    }
    //
    //    global.setTimeout = setTimer.bind(null, TYPE_ONE_SHOT);
    //    global.clearTimeout = unsetTimer.bind(null);
    //
    //})(global);

    global.i18n = (function () {

        // Randomize URI to work around bug 719376
        var stringBundle = Services.strings.createBundle('chrome://adguard/locale/messages.properties?' + Math.random());

        function getText(text, args) {
            if (!text) {
                return "";
            }
            if (args && args.length > 0) {
                text = text.replace(/\$(\d+)/g, function (match, number) {
                    return typeof args[number - 1] !== "undefined" ? args[number - 1] : match;
                });
            }
            return text;
        }

        return {
            getMessage: function (key, args) {
                try {
                    return getText(stringBundle.GetStringFromName(key), args);
                } catch (ex) {
                    // Key not found, simply return it as a translation
                    return key;
                }
            }
        };
    })();

    global.addEventListener('unload', function () {
        unload.fireUnload('Shutdown');
    });

})(window);