'use strict';

function safeString(value) {
    if (value === null || typeof value === 'undefined') {
        return '';
    }
    return String(value);
}

function readJsonBody(req) {
    if (req && req.body && typeof req.body === 'object') {
        return req.body;
    }

    var bodyString = '';
    try {
        if (request && request.httpParameterMap && request.httpParameterMap.requestBodyAsString) {
            bodyString = safeString(request.httpParameterMap.requestBodyAsString);
        }
    } catch (e) {
        bodyString = '';
    }

    if (!bodyString && req && req.body && typeof req.body === 'string') {
        bodyString = req.body;
    }

    if (!bodyString) {
        return null;
    }

    try {
        return JSON.parse(bodyString);
    } catch (e2) {
        return null;
    }
}

function getHttpPath(req) {
    try {
        if (request && request.httpPath) {
            return safeString(request.httpPath);
        }
    } catch (e) {
        // ignore
    }

    if (req && req.httpPath) {
        return safeString(req.httpPath);
    }

    if (req && req.pathInfo) {
        return safeString(req.pathInfo);
    }

    return '';
}

function getRouteParam(req, name, regex) {
    if (req && req.params && req.params[name]) {
        return safeString(req.params[name]);
    }

    if (req && req.httpParameterMap && req.httpParameterMap[name] && req.httpParameterMap[name].stringValue) {
        return safeString(req.httpParameterMap[name].stringValue);
    }

    try {
        if (request && request.httpParameterMap && request.httpParameterMap[name] && request.httpParameterMap[name].stringValue) {
            return safeString(request.httpParameterMap[name].stringValue);
        }
    } catch (e) {
        // ignore
    }

    if (regex) {
        var path = getHttpPath(req);
        var match = regex.exec(path);
        if (match && match[1]) {
            return safeString(match[1]);
        }
    }

    return '';
}

function getQueryParams(req) {
    if (req && req.querystring) {
        return req.querystring;
    }

    var params = {};
    try {
        if (request && request.httpParameterMap && request.httpParameterMap.parameterNames) {
            var names = request.httpParameterMap.parameterNames;
            while (names.hasNext()) {
                var key = names.next();
                if (key === 'requestBody') {
                    continue;
                }
                var param = request.httpParameterMap[key];
                if (param && param.stringValue) {
                    params[key] = safeString(param.stringValue);
                }
            }
        }
    } catch (e) {
        // ignore
    }
    return params;
}

function sendJsonError(res, statusCode, message, details) {
    res.setStatusCode(statusCode);
    res.json({
        error: true,
        message: message,
        details: details || null
    });
}

function sendServiceResult(res, result, successStatus) {
    var statusCode = result.statusCode || (result.ok ? (successStatus || 200) : 502);

    if (result.ok) {
        res.setStatusCode(statusCode);
        res.json(result.data || {});
        return;
    }

    sendJsonError(res, statusCode, result.errorMessage || 'ACI service error', result.data || result.raw || null);
}

module.exports = {
    readJsonBody: readJsonBody,
    getRouteParam: getRouteParam,
    getQueryParams: getQueryParams,
    sendJsonError: sendJsonError,
    sendServiceResult: sendServiceResult
};
