'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Logger = require('dw/system/Logger');
var aciConfig = require('*/cartridge/scripts/aci/aciConfig');

function buildUrl(baseUrl, apiPathPrefix, path, queryParams) {
    var url = baseUrl + apiPathPrefix + path;
    var query = '';

    if (queryParams) {
        var keys = Object.keys(queryParams);
        for (var i = 0; i < keys.length; i += 1) {
            var key = keys[i];
            if (queryParams[key] === null || typeof queryParams[key] === 'undefined' || queryParams[key] === '') {
                continue;
            }
            query += (query ? '&' : '?') + encodeURIComponent(key) + '=' + encodeURIComponent(String(queryParams[key]));
        }
    }

    return url + query;
}

function withEntityId(payload, queryParams, entityId) {
    var body = payload || null;
    var params = queryParams ? Object.assign({}, queryParams) : null;

    if (entityId) {
        if (body && typeof body === 'object' && !body.entityId) {
            body.entityId = entityId;
        }
        if (params) {
            if (!params.entityId) {
                params.entityId = entityId;
            }
        } else if (!body) {
            params = { entityId: entityId };
        }
    }

    return {
        body: body,
        params: params
    };
}

var service = LocalServiceRegistry.createService('aci.http', {
    createRequest: function (svc, params) {
        svc.setRequestMethod(params.method);
        svc.setURL(params.url);

        if (params.headers) {
            var headerKeys = Object.keys(params.headers);
            for (var i = 0; i < headerKeys.length; i += 1) {
                var headerName = headerKeys[i];
                var headerValue = params.headers[headerName];
                if (headerValue) {
                    svc.addHeader(headerName, headerValue);
                }
            }
        }

        if (params.body) {
            svc.addHeader('Content-Type', 'application/json');
            return JSON.stringify(params.body);
        }

        return null;
    },
    parseResponse: function (svc, client) {
        var text = client.text;
        var data = null;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch (e) {
                data = text;
            }
        }
        return {
            statusCode: client.statusCode,
            data: data,
            raw: text
        };
    },
    filterLogMessage: function (message) {
        return message;
    }
});

function normalizeResult(result) {
    return {
        ok: result && result.ok,
        status: result && result.status,
        statusCode: result && result.object && result.object.statusCode,
        data: result && result.object && result.object.data,
        raw: result && result.object && result.object.raw,
        errorMessage: result && result.errorMessage
    };
}

function call(method, path, payload, queryParams) {
    var config = aciConfig.getConfig();
    if (!config.baseUrl) {
        return {
            ok: false,
            statusCode: 500,
            errorMessage: 'ACI_BaseUrl site preference is not configured.'
        };
    }

    var entityPack = withEntityId(payload, queryParams, config.entityId);
    var url = buildUrl(config.baseUrl, config.apiPathPrefix, path, entityPack.params);

    var headers = {};
    if (config.accessToken) {
        if (config.authScheme) {
            headers[config.authHeaderName] = config.authScheme + ' ' + config.accessToken;
        } else {
            headers[config.authHeaderName] = config.accessToken;
        }
    }

    var result = service.call({
        method: method,
        url: url,
        body: entityPack.body,
        headers: headers
    });

    if (!result.ok) {
        Logger.error('ACI service call failed: {0} {1} - {2}', method, path, result.errorMessage);
    }

    return normalizeResult(result);
}

function createCheckout(payload) {
    return call('POST', '/checkouts', payload, null);
}

function submitPayment(checkoutId, payload) {
    return call('POST', '/checkouts/' + encodeURIComponent(checkoutId) + '/payment', payload, null);
}

function queryPayment(paymentId, queryParams) {
    return call('GET', '/query/' + encodeURIComponent(paymentId), null, queryParams);
}

module.exports = {
    createCheckout: createCheckout,
    submitPayment: submitPayment,
    queryPayment: queryPayment
};
