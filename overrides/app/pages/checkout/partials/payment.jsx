/*
 * Custom override of the default payment component so that we can
 * integrate with the ACI Worldwide gateway and also persist the
 * resulting payment instruction into SCAPI.  The stock implementation
 * lives in node_modules; we copy the original content here and then
 * make a few changes.
 */
import React, {useState, useMemo, useEffect, useRef} from 'react'
import PropTypes from 'prop-types'
import {defineMessage, FormattedMessage, useIntl} from 'react-intl'
import {
    Box,
    Button,
    Checkbox,
    Container,
    Heading,
    Stack,
    Spinner,
    Text,
    Divider
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useForm} from 'react-hook-form'
import {useToast} from '@salesforce/retail-react-app/app/hooks/use-toast'
import {useShopperBasketsMutation} from '@salesforce/commerce-sdk-react'
import {useCurrentBasket} from '@salesforce/retail-react-app/app/hooks/use-current-basket'
import {useCheckout} from '@salesforce/retail-react-app/app/pages/checkout/util/checkout-context'
import {getCreditCardIcon} from '@salesforce/retail-react-app/app/utils/cc-utils'
import {
    ToggleCard,
    ToggleCardEdit,
    ToggleCardSummary
} from '@salesforce/retail-react-app/app/components/toggle-card'
import ShippingAddressSelection from '@salesforce/retail-react-app/app/pages/checkout/partials/shipping-address-selection'
import AddressDisplay from '@salesforce/retail-react-app/app/components/address-display'
import {PromoCode, usePromoCode} from '@salesforce/retail-react-app/app/components/promo-code'
import {API_ERROR_MESSAGE} from '@salesforce/retail-react-app/app/constants'
import {isPickupShipment} from '@salesforce/retail-react-app/app/utils/shipment-utils'

// -----------------------------------------------------------------------------
// Helper that calls our backend route which creates an ACI checkout and returns
// the data needed to render the widget (checkoutId, widget script URL, etc.).
// -----------------------------------------------------------------------------
async function createAciCheckout(payload) {
    const resp = await fetch('/api/aci/create-checkout', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    })
    if (!resp.ok) {
        const err = await resp.text()
        throw new Error(`ACI request failed: ${err}`)
    }
    return resp.json()
}

const Payment = () => {
    const {formatMessage} = useIntl()
    const {data: basket} = useCurrentBasket()
    const isPickupOnly =
        basket?.shipments?.length > 0 &&
        basket.shipments.every((shipment) => isPickupShipment(shipment))
    const selectedShippingAddress = useMemo(() => {
        if (!basket?.shipments?.length || isPickupOnly) return null
        const deliveryShipment = basket.shipments.find((shipment) => !isPickupShipment(shipment))
        return deliveryShipment?.shippingAddress || null
    }, [basket?.shipments, isPickupShipment, isPickupOnly])

    const selectedBillingAddress = basket?.billingAddress
    const appliedPayment = basket?.paymentInstruments && basket?.paymentInstruments[0]
    const [billingSameAsShipping, setBillingSameAsShipping] = useState(!isPickupOnly)
    const [isCreatingCheckout, setIsCreatingCheckout] = useState(false)
    const [aciCheckoutId, setAciCheckoutId] = useState(null)
    const [aciWidgetScriptUrl, setAciWidgetScriptUrl] = useState(null)
    const [aciResultUrl, setAciResultUrl] = useState(null)
    const [aciBrands, setAciBrands] = useState(null)
    const [aciError, setAciError] = useState(null)
    const [isWidgetReady, setIsWidgetReady] = useState(false)
    const lastCheckoutKeyRef = useRef(null)

    useEffect(() => {
        if (isPickupOnly) {
            setBillingSameAsShipping(false)
        }
    }, [isPickupOnly])

    const {mutateAsync: updateBillingAddressForBasket} = useShopperBasketsMutation(
        'updateBillingAddressForBasket'
    )
    const {mutateAsync: removePaymentInstrumentFromBasket} = useShopperBasketsMutation(
        'removePaymentInstrumentFromBasket'
    )

    const showToast = useToast()
    const showError = () => {
        showToast({
            title: formatMessage(API_ERROR_MESSAGE),
            status: 'error'
        })
    }

    const {step, STEPS, goToStep, goToNextStep} = useCheckout()

    const billingAddressForm = useForm({
        mode: 'onChange',
        shouldUnregister: false,
        defaultValues: {...selectedBillingAddress}
    })

    // Using destructuring to remove properties from the object...
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {removePromoCode, ...promoCodeProps} = usePromoCode()

    const createCheckoutIfNeeded = async () => {
        if (!basket?.basketId) return

        const checkoutKey = JSON.stringify({
            basketId: basket.basketId,
            orderTotal: basket.orderTotal,
            currency: basket.currency
        })
        if (lastCheckoutKeyRef.current === checkoutKey) return
        lastCheckoutKeyRef.current = checkoutKey

        setIsCreatingCheckout(true)
        setAciError(null)

        try {
            const checkout = await createAciCheckout({
                basketId: basket.basketId,
                amount: basket.orderTotal,
                currency: basket.currency
            })
            setAciCheckoutId(checkout?.checkoutId || null)
            setAciWidgetScriptUrl(checkout?.widgetScriptUrl || null)
            setAciResultUrl(checkout?.resultUrl || null)
            setAciBrands(checkout?.brands || null)
        } catch (e) {
            lastCheckoutKeyRef.current = null
            setAciError(e.message || 'Failed to initialize payment')
            showError()
        } finally {
            setIsCreatingCheckout(false)
        }
    }

    useEffect(() => {
        if (step !== STEPS.PAYMENT || appliedPayment) return
        createCheckoutIfNeeded()
    }, [step, appliedPayment, basket?.basketId, basket?.orderTotal, basket?.currency])

    useEffect(() => {
        if (!aciCheckoutId || !aciWidgetScriptUrl || typeof window === 'undefined') {
            return
        }

        setIsWidgetReady(false)

        if (window.wpwlOptions) {
            delete window.wpwlOptions
        }
        window.wpwlOptions = {
            onReady: () => setIsWidgetReady(true)
        }

        const scriptId = 'aci-payment-widget'
        const existing = document.getElementById(scriptId)
        if (existing) {
            existing.remove()
        }

        const script = document.createElement('script')
        script.id = scriptId
        script.async = true
        script.src = `${aciWidgetScriptUrl}?checkoutId=${encodeURIComponent(aciCheckoutId)}`
        script.onerror = () => {
            setAciError('Failed to load payment widget')
            setIsWidgetReady(false)
        }
        document.body.appendChild(script)

        return () => {
            script.remove()
            if (window.wpwlOptions) {
                delete window.wpwlOptions
            }
        }
    }, [aciCheckoutId, aciWidgetScriptUrl])

    const onBillingSubmit = async () => {
        const isFormValid = await billingAddressForm.trigger()

        if (!isFormValid) {
            return
        }
        const billingAddress = billingSameAsShipping
            ? selectedShippingAddress
            : billingAddressForm.getValues()
        // Using destructuring to remove properties from the object...
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const {addressId, creationDate, lastModified, preferred, ...address} = billingAddress
        return await updateBillingAddressForBasket({
            body: address,
            parameters: {basketId: basket.basketId}
        })
    }
    const onPaymentRemoval = async () => {
        try {
            await removePaymentInstrumentFromBasket({
                parameters: {
                    basketId: basket.basketId,
                    paymentInstrumentId: appliedPayment.paymentInstrumentId
                }
            })
        } catch (e) {
            showError()
        }
    }

    const onReviewOrder = async () => {
        // If successful `onBillingSubmit` returns the updated basket. If the form was invalid on
        // submit, `undefined` is returned.
        const updatedBasket = await onBillingSubmit()

        if (updatedBasket) {
            goToNextStep()
        }
    }

    const billingAddressAriaLabel = defineMessage({
        defaultMessage: 'Billing Address Form',
        id: 'checkout_payment.label.billing_address_form'
    })

    return (
        <ToggleCard
            id="step-3"
            title={formatMessage({defaultMessage: 'Payment', id: 'checkout_payment.title.payment'})}
            editing={step === STEPS.PAYMENT}
            isLoading={
                isCreatingCheckout || billingAddressForm.formState.isSubmitting
            }
            disabled={appliedPayment == null}
            onEdit={() => goToStep(STEPS.PAYMENT)}
            editLabel={formatMessage({
                defaultMessage: 'Edit Payment Info',
                id: 'toggle_card.action.editPaymentInfo'
            })}
        >
            <ToggleCardEdit>
                <Box mt={-2} mb={4}>
                    <PromoCode {...promoCodeProps} itemProps={{border: 'none'}} />
                </Box>

                <Stack spacing={6}>
                    {!appliedPayment?.paymentCard ? (
                        <Stack spacing={3}>
                            {aciError && (
                                <Text color="red.600" fontSize="sm">
                                    {aciError}
                                </Text>
                            )}

                            {isCreatingCheckout && (
                                <Stack direction="row" spacing={3} alignItems="center">
                                    <Spinner size="sm" />
                                    <Text fontSize="sm" color="gray.600">
                                        <FormattedMessage
                                            defaultMessage="Loading secure payment form..."
                                            id="checkout_payment.label.loading_aci_widget"
                                        />
                                    </Text>
                                </Stack>
                            )}

                            {aciCheckoutId && aciWidgetScriptUrl ? (
                                <Box>
                                    <form
                                        className="paymentWidgets"
                                        action={aciResultUrl || '/aci-result'}
                                        data-brands={aciBrands || 'VISA MASTER'}
                                    ></form>
                                    {!isWidgetReady && !aciError && (
                                        <Text fontSize="sm" color="gray.600" mt={2}>
                                            <FormattedMessage
                                                defaultMessage="Preparing payment fields..."
                                                id="checkout_payment.label.preparing_aci_widget"
                                            />
                                        </Text>
                                    )}
                                </Box>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={createCheckoutIfNeeded}
                                    isDisabled={isCreatingCheckout || !basket?.basketId}
                                >
                                    <FormattedMessage
                                        defaultMessage="Load Payment Form"
                                        id="checkout_payment.button.load_payment_form"
                                    />
                                </Button>
                            )}
                        </Stack>
                    ) : (
                        <Stack spacing={3}>
                            <Heading as="h3" fontSize="md">
                                <FormattedMessage
                                    defaultMessage="Credit Card"
                                    id="checkout_payment.heading.credit_card"
                                />
                            </Heading>
                            <Stack direction="row" spacing={4}>
                                <PaymentCardSummary payment={appliedPayment} />
                                <Button
                                    variant="link"
                                    size="sm"
                                    colorScheme="red"
                                    onClick={onPaymentRemoval}
                                >
                                    <FormattedMessage
                                        defaultMessage="Remove"
                                        id="checkout_payment.action.remove"
                                    />
                                </Button>
                            </Stack>
                        </Stack>
                    )}

                    <Divider borderColor="gray.100" />

                    <Stack spacing={2}>
                        <Heading as="h3" fontSize="md">
                            <FormattedMessage
                                defaultMessage="Billing Address"
                                id="checkout_payment.heading.billing_address"
                            />
                        </Heading>

                        {!isPickupOnly && (
                            <Checkbox
                                name="billingSameAsShipping"
                                isChecked={billingSameAsShipping}
                                onChange={(e) => setBillingSameAsShipping(e.target.checked)}
                            >
                                <Text fontSize="sm" color="gray.700">
                                    <FormattedMessage
                                        defaultMessage="Same as shipping address"
                                        id="checkout_payment.label.same_as_shipping"
                                    />
                                </Text>
                            </Checkbox>
                        )}

                        {billingSameAsShipping && selectedShippingAddress && (
                            <Box pl={7}>
                                <AddressDisplay address={selectedShippingAddress} />
                            </Box>
                        )}
                    </Stack>

                    {!billingSameAsShipping && (
                        <ShippingAddressSelection
                            form={billingAddressForm}
                            selectedAddress={selectedBillingAddress}
                            formTitleAriaLabel={billingAddressAriaLabel}
                            hideSubmitButton
                            isBillingAddress
                        />
                    )}

                    <Box pt={3}>
                        <Container variant="form">
                            <Button w="full" onClick={onReviewOrder} isDisabled={!appliedPayment}>
                                <FormattedMessage
                                    defaultMessage="Review Order"
                                    id="checkout_payment.button.review_order"
                                />
                            </Button>
                        </Container>
                    </Box>
                </Stack>
            </ToggleCardEdit>

            <ToggleCardSummary>
                <Stack spacing={6}>
                    {appliedPayment && (
                        <Stack spacing={3}>
                            <Heading as="h3" fontSize="md">
                                <FormattedMessage
                                    defaultMessage="Credit Card"
                                    id="checkout_payment.heading.credit_card"
                                />
                            </Heading>
                            <PaymentCardSummary payment={appliedPayment} />
                        </Stack>
                    )}

                    <Divider borderColor="gray.100" />

                    {selectedBillingAddress && (
                        <Stack spacing={2}>
                            <Heading as="h3" fontSize="md">
                                <FormattedMessage
                                    defaultMessage="Billing Address"
                                    id="checkout_payment.heading.billing_address"
                                />
                            </Heading>
                            <AddressDisplay address={selectedBillingAddress} />
                        </Stack>
                    )}
                </Stack>
            </ToggleCardSummary>
        </ToggleCard>
    )
}

const PaymentCardSummary = ({payment}) => {
    const CardIcon = getCreditCardIcon(payment?.paymentCard?.cardType)
    const lastDigits =
        payment?.paymentCard?.numberLastDigits ||
        payment?.paymentCard?.maskedNumber?.slice(-4) ||
        ''
    return (
        <Stack direction="row" alignItems="center" spacing={3}>
            {CardIcon && <CardIcon layerStyle="ccIcon" />}

            <Stack direction="row">
                <Text>{payment.paymentCard.cardType}</Text>
                <Text>&bull;&bull;&bull;&bull; {lastDigits}</Text>
                <Text>
                    {payment.paymentCard.expirationMonth}/{payment.paymentCard.expirationYear}
                </Text>
            </Stack>
        </Stack>
    )
}

PaymentCardSummary.propTypes = {payment: PropTypes.object}

export default Payment
