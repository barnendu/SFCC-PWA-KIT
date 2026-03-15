'use strict';

var aciClient = require('*/cartridge/scripts/aci/aciClient');

function parseBody(request) {
    if (!request || typeof request.body === 'undefined' || request.body === null) {
        return null;
    }

    if (typeof request.body === 'string') {
        try {
            return JSON.parse(request.body);
        } catch (e) {
            return null;
        }
    }

    if (typeof request.body === 'object') {
        return request.body;
    }

    return null;
}

function errorResponse(statusCode, message, details) {
    return {
        statusCode: statusCode,
        body: {
            error: true,
            message: message,
            details: details || null
        }
    };
}

function successResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        body: body || {}
    };
}

function handleServiceResult(result, successStatus) {
    if (result && result.ok) {
        return successResponse(result.statusCode || successStatus, result.data || {});
    }

    return errorResponse(result.statusCode || 502, (result && result.errorMessage) || 'ACI service error', (result && (result.data || result.raw)) || null);
}

exports.createAciCheckoutId = function (request) {
    var payload = parseBody(request);
    if (!payload) {
        return errorResponse(400, 'Invalid or missing JSON body.');
    }

    var result = aciClient.createCheckout(payload);
    return handleServiceResult(result, 201);
};

exports.submitAciPayment = function (request) {
    var checkoutId = request && request.pathParams && request.pathParams.checkoutId;
    if (!checkoutId) {
        return errorResponse(400, 'Missing checkoutId in path.');
    }

    var payload = parseBody(request);
    if (!payload) {
        return errorResponse(400, 'Invalid or missing JSON body.');
    }

    var result = aciClient.submitPayment(String(checkoutId), payload);
    return handleServiceResult(result, 200);
};

exports.queryAciPayment = function (request) {
    var paymentId = request && request.pathParams && request.pathParams.paymentId;
    if (!paymentId) {
        return errorResponse(400, 'Missing paymentId in path.');
    }

    var queryParams = request && request.queryParams ? request.queryParams : null;
    var result = aciClient.queryPayment(String(paymentId), queryParams);
    return handleServiceResult(result, 200);
};
