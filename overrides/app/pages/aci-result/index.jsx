/*
 * ACI payment result handler. This page is used as the shopperResultUrl for
 * the ACI widget. It queries the payment result on the server, stores the
 * payment instrument in SCAPI, and then redirects back to checkout.
 */
import React, {useEffect, useState} from 'react'
import {useLocation, useHistory} from 'react-router-dom'
import {useIntl} from 'react-intl'
import {useShopperBasketsMutation} from '@salesforce/commerce-sdk-react'
import {useToast} from '@salesforce/retail-react-app/app/hooks/use-toast'
import {useCurrentBasket} from '@salesforce/retail-react-app/app/hooks/use-current-basket'
import {
    Box,
    Button,
    Heading,
    Spinner,
    Stack,
    Text
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {getPaymentInstrumentCardType} from '@salesforce/retail-react-app/app/utils/cc-utils'

const AciResult = () => {
    const {formatMessage} = useIntl()
    const location = useLocation()
    const history = useHistory()
    const showToast = useToast()
    const {data: basket} = useCurrentBasket()
    const {mutateAsync: addPaymentInstrumentToBasket} = useShopperBasketsMutation(
        'addPaymentInstrumentToBasket'
    )
    const {mutateAsync: removePaymentInstrumentFromBasket} = useShopperBasketsMutation(
        'removePaymentInstrumentFromBasket'
    )
    const [status, setStatus] = useState('processing')
    const [errorMessage, setErrorMessage] = useState('')

    useEffect(() => {
        let isCancelled = false
        const searchParams = new URLSearchParams(location.search)
        const resourcePath = searchParams.get('resourcePath')
        const checkoutId = searchParams.get('id') || searchParams.get('checkoutId')
        const basketId = searchParams.get('basketId') || basket?.basketId

        const run = async () => {
            if (!basketId) {
                throw new Error('Missing basket identifier.')
            }

            const resp = await fetch('/api/aci/', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({resourcePath, checkoutId})
            })

            if (!resp.ok) {
                const errText = await resp.text()
                throw new Error(errText || 'Failed to fetch payment result.')
            }

            const {success, paymentResult} = await resp.json()
            if (!success) {
                throw new Error(
                    paymentResult?.result?.description || 'Payment was not successful.'
                )
            }

            if (basket?.paymentInstruments?.length) {
                const existing = basket.paymentInstruments[0]
                if (existing?.paymentInstrumentId) {
                    await removePaymentInstrumentFromBasket({
                        parameters: {
                            basketId,
                            paymentInstrumentId: existing.paymentInstrumentId
                        }
                    })
                }
            }

            const card =
                paymentResult?.card ||
                paymentResult?.payment?.card ||
                paymentResult?.cardData ||
                {}
            const brand =
                paymentResult?.paymentBrand ||
                paymentResult?.payment?.brand ||
                paymentResult?.brand ||
                card?.brand ||
                ''
            const last4 =
                card?.last4Digits || card?.last4 || paymentResult?.card?.last4Digits || ''
            const expMonth =
                card?.expiryMonth || card?.expirationMonth || paymentResult?.card?.expiryMonth
            const expYear =
                card?.expiryYear || card?.expirationYear || paymentResult?.card?.expiryYear
            const holder =
                card?.holder || paymentResult?.card?.holder || basket?.customerInfo?.email || ''
            const normalizedBrand = getPaymentInstrumentCardType(brand) || brand

            const paymentInstrument = {
                paymentMethodId: 'CREDIT_CARD',
                paymentCard: {
                    holder,
                    maskedNumber: last4 ? `**** **** **** ${last4}` : undefined,
                    numberLastDigits: last4 || undefined,
                    cardType: normalizedBrand,
                    expirationMonth: expMonth ? parseInt(expMonth, 10) : undefined,
                    expirationYear: expYear ? parseInt(expYear, 10) : undefined
                },
                custom: {
                    aciCheckoutId: checkoutId || paymentResult?.id || null,
                    aciPaymentId: paymentResult?.id || paymentResult?.paymentId || null,
                    aciResultCode: paymentResult?.result?.code || null,
                    aciResultDescription: paymentResult?.result?.description || null,
                    aciRawPayload: paymentResult || null
                }
            }

            await addPaymentInstrumentToBasket({
                parameters: {basketId},
                body: paymentInstrument
            })

            if (isCancelled) return
            setStatus('success')
            history.replace('/checkout')
        }

        run().catch((err) => {
            if (isCancelled) return
            const message = err?.message || 'Payment processing failed.'
            setStatus('error')
            setErrorMessage(message)
            showToast({title: message, status: 'error'})
        })

        return () => {
            isCancelled = true
        }
    }, [location.search, basket?.basketId])

    return (
        <Box maxW="lg" mx="auto" py={12} px={6}>
            <Stack spacing={4} alignItems="center" textAlign="center">
                {status === 'processing' && (
                    <>
                        <Spinner size="lg" />
                        <Heading as="h1" fontSize="xl">
                            {formatMessage({
                                defaultMessage: 'Processing payment...',
                                id: 'aci_result.heading.processing'
                            })}
                        </Heading>
                        <Text fontSize="sm" color="gray.600">
                            {formatMessage({
                                defaultMessage: 'Please wait while we confirm your payment.',
                                id: 'aci_result.body.processing'
                            })}
                        </Text>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <Heading as="h1" fontSize="xl">
                            {formatMessage({
                                defaultMessage: 'Payment failed',
                                id: 'aci_result.heading.error'
                            })}
                        </Heading>
                        <Text fontSize="sm" color="gray.600">
                            {errorMessage ||
                                formatMessage({
                                    defaultMessage:
                                        'We could not confirm the payment. Please try again.',
                                    id: 'aci_result.body.error'
                                })}
                        </Text>
                        <Button onClick={() => history.replace('/checkout')}>
                            {formatMessage({
                                defaultMessage: 'Return to checkout',
                                id: 'aci_result.button.return'
                            })}
                        </Button>
                    </>
                )}
            </Stack>
        </Box>
    )
}

export default AciResult
