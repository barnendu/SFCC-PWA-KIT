'use strict';

var server = require('server');
var aciClient = require('*/cartridge/scripts/aci/aciClient');
var aciUtils = require('*/cartridge/scripts/aci/aciUtils');

server.post('Create', function (req, res, next) {
    var payload = aciUtils.readJsonBody(req);
    if (!payload) {
        aciUtils.sendJsonError(res, 400, 'Invalid or missing JSON body.');
        return next();
    }

    var result = aciClient.createCheckout(payload);
    aciUtils.sendServiceResult(res, result, 201);
    return next();
});

server.post('Payment', function (req, res, next) {
    var checkoutId = aciUtils.getRouteParam(req, 'checkoutId', /\/checkouts\/([^\/]+)\/payment/i);
    if (!checkoutId) {
        aciUtils.sendJsonError(res, 400, 'Missing checkoutId in path.');
        return next();
    }

    var payload = aciUtils.readJsonBody(req);
    if (!payload) {
        aciUtils.sendJsonError(res, 400, 'Invalid or missing JSON body.');
        return next();
    }

    var result = aciClient.submitPayment(checkoutId, payload);
    aciUtils.sendServiceResult(res, result, 200);
    return next();
});

module.exports = server.exports();
