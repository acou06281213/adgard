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

/**
 * Object that manages user settings.
 * @constructor
 */
adguard.notifications = (function (adguard) {
    'use strict';

    const VIEWED_NOTIFICATIONS = 'viewed-notifications';
    const LAST_NOTIFICATION_TIME = 'viewed-notification-time';

    const blackFridayNotification = {
        id: 'blackFriday2019',
        locales: {
            en: {
                title: 'BLACK FRIDAY SALE ',
                desc: '(save up to 60%)',
                btn: 'Upgrade protection',
            },
            de: {
                title: 'BLACK FRIDAY SALE',
                desc: '(bis zu 60% Rabatt)',
                btn: 'Den Schutz upgraden',
            },
            ru: {
                title: 'ЧЁРНАЯ ПЯТНИЦА:',
                desc: 'СКИДКИ до 60%!',
                btn: 'Улучшить защиту',
            },
            fr: {
                title: 'PROMO BLACK FRIDAY',
                desc: '(jusqu’à -60%)',
                btn: 'Améliorer la protection',
            },
            it: {
                title: 'SCONTI BLACK FRIDAY',
                desc: '(fino a -60%)',
                btn: 'Migliora la protezione',
            },
            ja: {
                title: 'BLACK FRIDAY SALE',
                desc: '(最大60%OFF)',
                btn: 'パワーアップ',
            },
            ko: {
                title: 'BLACK FRIDAY SALE',
                desc: '(60% 할인)',
                btn: '보호 업그레이드',
            },
        },
        text: '',
        url: 'https://adguard.com/forward.html?action=bf2019_notify&from=popup&app=browser_extension',
        from: '29 November 2019 00:00:00',
        to: '2 December 2019 00:00:00',
        type: 'animated',
        badgeText: '%',
        badgeBgColor: '#ff0000',
    };

    /**
     * @typedef Notification
     * @type object
     * @property {string} id
     * @property {object} locales
     * @property {string} url
     * @property {string} text
     * @property {string} from
     * @property {string} to
     * @property {string} bgColor;
     * @property {string} textColor;
     * @property {string} badgeBgColor;
     * @property {string} badgeText;
     * @property {string} type;
     */
    let notifications = {
        blackFriday: blackFridayNotification,
    };

    /**
     * Gets the last time a notification was shown.
     * If it was not shown yet, initialized with the current time.
     */
    const getLastNotificationTime = function () {
        let lastTime = adguard.localStorage.getItem(LAST_NOTIFICATION_TIME) || 0;
        if (lastTime === 0) {
            lastTime = new Date().getTime();
            adguard.localStorage.setItem(LAST_NOTIFICATION_TIME, lastTime);
        }
        return lastTime;
    };

    /**
     * Scans notification locales and returns the one matching navigator.language
     * @param {*} notification notification object
     * @returns {string} matching text or null
     */
    const getNotificationText = function (notification) {
        const { language } = navigator;
        if (!language) {
            return null;
        }

        const languageCode = language.split('-')[0];
        if (!languageCode) {
            return null;
        }

        return notification.locales[language] || notification.locales[languageCode];
    };

    /**
     * Scans notifications list and prepares them to be used (or removes expired)
     */
    const initNotifications = function () {
        const notificationsKeys = Object.keys(notifications);

        for (let i = 0; i < notificationsKeys.length; i += 1) {
            const notificationKey = notificationsKeys[i];
            const notification = notifications[notificationKey];

            notification.text = getNotificationText(notification);

            const to = new Date(notification.to).getTime();
            const expired = new Date().getTime() > to;

            if (!notification.text || expired) {
                // Remove expired and invalid
                delete notifications[notificationKey];
            }
        }
    };

    // Prepare the notifications
    initNotifications();

    let currentNotification;
    let notificationCheckTime;
    const checkTimeoutMs = 10 * 60 * 1000; // 10 minutes
    const minPeriod = 30 * 60 * 1000; // 30 minutes
    const DELAY = 30 * 1000; // clear notification in 30 seconds
    let timeoutId;

    /**
     * Marks current notification as viewed
     * @param {boolean} withDelay if true, do this after a 30 sec delay
     */
    const setNotificationViewed = function (withDelay) {
        if (withDelay) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                setNotificationViewed(false);
            }, DELAY);
            return;
        }

        if (currentNotification) {
            const viewedNotifications = adguard.localStorage.getItem(VIEWED_NOTIFICATIONS) || [];
            const { id } = currentNotification;
            if (!viewedNotifications.includes(id)) {
                viewedNotifications.push(id);
                adguard.localStorage.setItem(VIEWED_NOTIFICATIONS, viewedNotifications);
                adguard.tabs.getActive(adguard.ui.updateTabIconAndContextMenu);
                currentNotification = null;
            }
        }
    };

    /**
     * Finds out notification for current time and checks if notification wasn't shown yet
     *
     * @param {*} - (optional) frameInfo from `adguard.frames`
     * @returns {void|Notification} - notification
     */
    const getCurrentNotification = function (frameInfo) {
        const currentTime = new Date().getTime();
        const timeSinceLastNotification = currentTime - getLastNotificationTime();
        if (timeSinceLastNotification < minPeriod) {
            // Just a check to not show the notification too often
            return null;
        }

        if (frameInfo && frameInfo.adguardDetected) {
            Object.keys(notifications).forEach((key) => {
                currentNotification = notifications[key];
                setNotificationViewed(false);
            });
            notifications = {};
            currentNotification = null;
            return null;
        }

        // Check not often than once in 10 minutes
        const timeSinceLastCheck = currentTime - notificationCheckTime;
        if (notificationCheckTime > 0 && timeSinceLastCheck <= checkTimeoutMs) {
            return currentNotification;
        }
        // Update the last notification check time
        notificationCheckTime = currentTime;

        const notificationsKeys = Object.keys(notifications);
        const viewedNotifications = adguard.localStorage.getItem(VIEWED_NOTIFICATIONS) || [];

        for (let i = 0; i < notificationsKeys.length; i += 1) {
            const notificationKey = notificationsKeys[i];
            const notification = notifications[notificationKey];
            const from = new Date(notification.from).getTime();
            const to = new Date(notification.to).getTime();
            if (from < currentTime
                && to > currentTime
                && !viewedNotifications.includes(notification.id)
            ) {
                currentNotification = notification;
                return currentNotification;
            }
        }
        currentNotification = null;
        return currentNotification;
    };

    return {
        getCurrentNotification,
        setNotificationViewed,
    };
})(adguard);
