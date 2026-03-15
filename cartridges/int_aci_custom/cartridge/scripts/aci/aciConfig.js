'use strict';

var Site = require('dw/system/Site');

function getPref(name, defaultValue) {
    var value = Site.getCurrent().getCustomPreferenceValue(name);
    if (value === null || typeof value === 'undefined') {
        return defaultValue;
    }
    return value;
}

function normalizeBaseUrl(url) {
    if (!url) {
        return '';
    }
    return String(url).replace(/\/$/, '');
}

function normalizePathPrefix(prefix) {
    if (!prefix) {
        return '';
    }
    var value = String(prefix);
    if (value.charAt(0) !== '/') {
        value = '/' + value;
    }
    return value.replace(/\/$/, '');
}

function getConfig() {
    return {
        baseUrl: normalizeBaseUrl(getPref('ACI_BaseUrl', '')),
        apiPathPrefix: normalizePathPrefix(getPref('ACI_ApiPathPrefix', '/v1')),
        entityId: getPref('ACI_EntityId', ''),
        accessToken: getPref('ACI_AccessToken', ''),
        authHeaderName: getPref('ACI_AuthHeaderName', 'Authorization'),
        authScheme: getPref('ACI_AuthScheme', 'Bearer')
    };
}

module.exports = {
    getConfig: getConfig
};
