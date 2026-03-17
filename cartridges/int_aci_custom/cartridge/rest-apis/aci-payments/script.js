'use strict';

var BasketMgr = require('dw/order/BasketMgr');
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

function getQueryParam(request, name) {
    if (request && request.queryParams && request.queryParams[name]) {
        return String(request.queryParams[name]);
    }

    return '';
}

function getBasketById(basketId) {
    var basket = null;
    var currentBasket = null;

    try {
        basket = BasketMgr.getBasket(basketId);
    } catch (e) {
        basket = null;
    }

    if (basket) {
        return basket;
    }

    try {
        currentBasket = BasketMgr.getCurrentBasket();
    } catch (e2) {
        currentBasket = null;
    }

    if (currentBasket && currentBasket.getUUID() === basketId) {
        return currentBasket;
    }

    return null;
}

function getBasketExternalOrderNumber(basket) {
    if (!basket || !basket.custom || !basket.custom.externalOrderNumber) {
        return '';
    }

    return String(basket.custom.externalOrderNumber);
}

function getBasketAmount(basket) {
    var totalGrossPrice = basket ? basket.getTotalGrossPrice() : null;
    if (!totalGrossPrice || !totalGrossPrice.available) {
        return '';
    }

    return totalGrossPrice.getDecimalValue().toString();
}

function buildCheckoutPayload(basket) {
    return {
        merchantTransactionId: getBasketExternalOrderNumber(basket),
        amount: getBasketAmount(basket),
        currency: basket.getCurrencyCode(),
        paymentType: 'PA',
        integrity: true
    };
}

exports.createAciCheckoutId = function (request) {
    var basketId = getQueryParam(request, 'basketId');
    var basket;
    var payload;

    if (!basketId) {
        return errorResponse(400, 'Missing basketId query parameter.');
    }

    basket = getBasketById(basketId);
    if (!basket) {
        return errorResponse(404, 'Basket not found for the supplied basketId.');
    }

    payload = buildCheckoutPayload(basket);
    if (!payload.merchantTransactionId) {
        return errorResponse(400, 'Basket custom attribute externalOrderNumber is missing.');
    }

    if (!payload.amount) {
        return errorResponse(400, 'Basket total amount is unavailable.');
    }

    if (!payload.currency) {
        return errorResponse(400, 'Basket currency is unavailable.');
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
