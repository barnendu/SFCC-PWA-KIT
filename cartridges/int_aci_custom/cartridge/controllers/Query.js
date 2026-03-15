'use strict';

var server = require('server');
var aciClient = require('*/cartridge/scripts/aci/aciClient');
var aciUtils = require('*/cartridge/scripts/aci/aciUtils');

server.get('Result', function (req, res, next) {
    var paymentId = aciUtils.getRouteParam(req, 'paymentId', /\/query\/([^\/]+)/i);
    if (!paymentId) {
        aciUtils.sendJsonError(res, 400, 'Missing paymentId in path.');
        return next();
    }

    var queryParams = aciUtils.getQueryParams(req);
    var result = aciClient.queryPayment(paymentId, queryParams);
    aciUtils.sendServiceResult(res, result, 200);
    return next();
});

module.exports = server.exports();
