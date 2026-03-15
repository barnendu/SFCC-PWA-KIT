export const getAciBaseEndpoint = (endpoint) => {
    if (!endpoint) return ''
    return endpoint.replace(/\/+$/, '')
}

export const getAciCheckoutUrl = (endpoint) => {
    const base = getAciBaseEndpoint(endpoint)
    if (!base) return ''
    return base.endsWith('/v1') ? `${base}/checkouts` : `${base}/v1/checkouts`
}

export const getAciPaymentWidgetUrl = (endpoint, widgetScriptUrl) => {
    if (widgetScriptUrl) return widgetScriptUrl
    const base = getAciBaseEndpoint(endpoint)
    if (!base) return ''
    return base.endsWith('/v1') ? `${base}/paymentWidgets.js` : `${base}/v1/paymentWidgets.js`
}

export const buildAciAuthHeaders = (aciGateway) => {
    const headers = {}
    if (aciGateway?.authHeader) {
        headers.Authorization = aciGateway.authHeader
    } else if (aciGateway?.apiKey) {
        // If your ACI account uses a different auth scheme, set ACI_AUTH_HEADER instead.
        headers.Authorization = `Bearer ${aciGateway.apiKey}`
    }
    return headers
}

export const isAciSuccessCode = (code) => {
    if (!code) return false
    // Adjust these prefixes to match your ACI success criteria.
    const successPrefixes = ['000.000.', '000.100.1', '000.3']
    return successPrefixes.some((prefix) => code.startsWith(prefix))
}

export const getAciCspOrigins = (aciGateway) => {
    const origins = new Set()
    const addOrigin = (value) => {
        if (!value) return
        try {
            origins.add(new URL(value).origin)
        } catch (e) {
            // Ignore invalid URLs
        }
    }
    addOrigin(aciGateway?.endpoint)
    addOrigin(aciGateway?.widgetScriptUrl)
    return Array.from(origins)
}

export const createAciCheckout = async ({aciGateway, amount, currency, basketId, appOrigin}) => {
    const endpoint = aciGateway?.endpoint
    const entityId = aciGateway?.entityId

    if (!endpoint || !entityId) {
        throw new Error(
            'ACI gateway is not configured. Set ACI_GATEWAY_ENDPOINT and ACI_ENTITY_ID.'
        )
    }
    if (!amount || !currency) {
        throw new Error('Missing amount or currency for ACI checkout.')
    }

    const resultUrl = new URL(aciGateway?.resultPath || '/aci-result', appOrigin)
    if (basketId) {
        resultUrl.searchParams.set('basketId', basketId)
    }

    const payload = new URLSearchParams()
    payload.set('entityId', entityId)
    payload.set('amount', typeof amount === 'number' ? amount.toFixed(2) : String(amount))
    payload.set('currency', currency)
    payload.set('paymentType', aciGateway?.paymentType || 'DB')
    payload.set('shopperResultUrl', resultUrl.toString())
    if (basketId) {
        payload.set('merchantTransactionId', basketId)
    }

    const response = await fetch(getAciCheckoutUrl(endpoint), {
        method: 'POST',
        headers: {
            ...buildAciAuthHeaders(aciGateway),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: payload.toString()
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to create ACI checkout.')
    }

    const data = await response.json()
    const widgetScriptUrl = getAciPaymentWidgetUrl(endpoint, aciGateway?.widgetScriptUrl)

    return {
        checkoutId: data?.id,
        widgetScriptUrl,
        resultUrl: resultUrl.toString(),
        brands: aciGateway?.brands || 'VISA MASTER'
    }
}

export const fetchAciPaymentResult = async ({aciGateway, resourcePath, checkoutId}) => {
    const endpoint = aciGateway?.endpoint
    const entityId = aciGateway?.entityId

    if (!endpoint || !entityId) {
        throw new Error(
            'ACI gateway is not configured. Set ACI_GATEWAY_ENDPOINT and ACI_ENTITY_ID.'
        )
    }

    let urlToFetch = ''
    const baseEndpoint = getAciBaseEndpoint(endpoint)

    if (resourcePath) {
        if (resourcePath.startsWith('http')) {
            if (!resourcePath.startsWith(baseEndpoint)) {
                throw new Error('Invalid resourcePath origin.')
            }
            urlToFetch = resourcePath
        } else if (resourcePath.startsWith('/')) {
            urlToFetch = `${baseEndpoint}${resourcePath}`
        } else {
            throw new Error('Invalid resourcePath format.')
        }
    } else if (checkoutId) {
        const paymentUrl = baseEndpoint.endsWith('/v1')
            ? `${baseEndpoint}/checkouts/${checkoutId}/payment`
            : `${baseEndpoint}/v1/checkouts/${checkoutId}/payment`
        urlToFetch = paymentUrl
    } else {
        throw new Error('Missing resourcePath or checkoutId.')
    }

    const url = new URL(urlToFetch)
    if (!url.searchParams.get('entityId')) {
        url.searchParams.set('entityId', entityId)
    }

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            ...buildAciAuthHeaders(aciGateway)
        }
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to query ACI payment result.')
    }

    const paymentResult = await response.json()
    return {
        success: isAciSuccessCode(paymentResult?.result?.code),
        paymentResult
    }
}
