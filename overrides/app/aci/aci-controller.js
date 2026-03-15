import {getAppOrigin} from '@salesforce/pwa-kit-react-sdk/utils/url'
import {createAciCheckout, fetchAciPaymentResult} from './aci-service'

export const createAciCheckoutController = async (req, res, config) => {
    try {
        const {basketId, amount, currency} = req.body || {}
        if (!amount || !currency) {
            return res.status(400).send('Missing amount or currency for ACI checkout.')
        }

        const aciGateway = config.app?.aciGateway || {}
        const appOrigin = getAppOrigin(req)
        const data = await createAciCheckout({
            aciGateway,
            amount,
            currency,
            basketId,
            appOrigin
        })
        res.json(data)
    } catch (err) {
        console.error('ACI create-checkout error', err)
        res.status(500).send(err.message || 'failed to create ACI checkout')
    }
}

export const fetchAciPaymentResultController = async (req, res, config) => {
    try {
        const {resourcePath, checkoutId} = req.body || {}
        if (!resourcePath && !checkoutId) {
            return res.status(400).send('Missing resourcePath or checkoutId.')
        }

        const aciGateway = config.app?.aciGateway || {}
        const data = await fetchAciPaymentResult({
            aciGateway,
            resourcePath,
            checkoutId
        })
        res.json(data)
    } catch (err) {
        console.error('ACI payment-result error', err)
        res.status(500).send(err.message || 'failed to query ACI payment result')
    }
}
