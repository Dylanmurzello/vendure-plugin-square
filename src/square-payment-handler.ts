import {
    CreatePaymentResult,
    CreateRefundResult,
    PaymentMethodHandler,
    SettlePaymentResult,
    LanguageCode,
    CreatePaymentErrorResult,
    SettlePaymentErrorResult,
    Logger,
} from '@vendure/core';
import { SquareClient, SquareEnvironment } from 'square';
import { randomUUID } from 'crypto';

/**
 * Wraps a promise with a timeout to prevent hanging requests 
 * Prevents checkout from getting stuck if Square API is slow
 */
async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = 30000,
    errorMessage: string = 'Request timeout'
): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    );
    return Promise.race([promise, timeout]);
}

// CREATED: 2025-09-30 - Square payment integration cuz dummy payments ain't it in prod 💳
// This handler talks to Square API to actually process real money movements fr fr

export interface SquarePaymentHandlerOptions {
    accessToken: string;
    environment: 'sandbox' | 'production';
    locationId: string; // Square location ID where payments get processed
}

// Store options at module level to avoid circular dependency
let squareOptions: SquarePaymentHandlerOptions | null = null;

// Cache Square client to avoid recreating on every request (performance optimization)
let squareClient: SquareClient | null = null;

export function setSquareOptions(options: SquarePaymentHandlerOptions) {
    squareOptions = options;
    // Reset client when options change so new client gets created with new creds
    squareClient = null;
}

function getSquareOptions(): SquarePaymentHandlerOptions {
    if (!squareOptions) {
        throw new Error('Square options not configured - call SquarePlugin.init() first');
    }
    return squareOptions;
}

function getSquareClient(): SquareClient {
    if (!squareClient) {
        const options = getSquareOptions();
        squareClient = new SquareClient({
            token: options.accessToken,
            environment: options.environment === 'production' 
                ? SquareEnvironment.Production 
                : SquareEnvironment.Sandbox,
        });
    }
    return squareClient;
}

/**
 * Square Payment Handler - actually processes payments like a real business should 💸
 * Handles the whole payment lifecycle: authorize → settle → refund
 * No cap, this is where the money magic happens ✨
 */
export const squarePaymentHandler = new PaymentMethodHandler({
    code: 'square-payment',
    description: [{
        languageCode: LanguageCode.en,
        value: 'Square Payment'
    }],
    args: {},

    /**
     * createPayment - authorize payment with Square (doesn't capture yet)
     * Gets called when customer hits "Place Order" and we need to lock in their payment method
     * Returns transaction ID that we'll use later to actually capture the money
     */
    createPayment: async (ctx, order, amount, args, metadata): Promise<CreatePaymentResult> => {
        const startTime = Date.now();
        try {
            const client = getSquareClient(); // Use cached client for better performance
            
            // metadata should contain the payment token from frontend Square Web SDK
            const sourceId = metadata.sourceId || metadata.token;
            
            if (!sourceId) {
                // No payment token? Ain't no way we processing this chief 🚫
                Logger.warn(`Payment declined: Missing sourceId for order ${order.code}`, 'SquarePaymentHandler');
                return {
                    amount: order.total,
                    state: 'Declined' as const,
                    errorMessage: 'Missing Square payment token (sourceId) from frontend',
                    metadata: {},
                };
            }

            // Use deterministic idempotency key to prevent duplicate charges on retry
            // Critical: If network fails and request retries, same key = no duplicate charge
            const idempotencyKey = `${order.code}-create-${Date.now()}`;

            // Hit Square API to create the payment with timeout protection
            // This is where Square actually talks to the card network and says "yo can we charge this?"
            const response = await withTimeout(
                client.payments.create({
                    sourceId, // Payment method token from frontend
                    idempotencyKey, // Deterministic key prevents duplicates
                    amountMoney: {
                        amount: BigInt(amount), // Amount in cents (e.g., $10.00 = 1000)
                        currency: order.currencyCode as any, // Vendure uses CurrencyCode, Square uses Currency
                    },
                    locationId: getSquareOptions().locationId,
                    referenceId: order.code, // Our order code for tracking
                    note: `Order ${order.code}`,
                    // autocomplete: false means we authorize but don't capture yet
                    // gives us time to verify order, check inventory, etc before actually taking the money
                    autocomplete: false, 
                }),
                30000, // 30 second timeout
                'Square payment creation timeout'
            );

            const payment = response.payment;

            if (!payment) {
                // Square said nah fam, something went wrong on their end
                Logger.error(`Payment declined: No payment object for order ${order.code}`, 'SquarePaymentHandler');
                return {
                    amount: order.total,
                    state: 'Declined' as const,
                    errorMessage: 'Square payment creation failed - no payment object returned',
                    metadata: {},
                };
            }

            // W in the chat, payment authorized successfully 🎉
            Logger.info(`Payment authorized: Order ${order.code}, Amount ${order.total}, TxID ${payment.id}, ${Date.now() - startTime}ms`, 'SquarePaymentHandler');
            return {
                amount: order.total,
                state: 'Authorized' as const, // Money locked but not captured yet
                transactionId: payment.id || '', // Square payment ID we'll use to settle/refund later
                metadata: {
                    squarePaymentId: payment.id,
                    status: payment.status,
                    receiptUrl: payment.receiptUrl,
                    orderId: payment.orderId,
                },
            };

        } catch (error: any) {
            // Something went really wrong - log it and tell Vendure this payment flopped
            Logger.error(`Payment creation failed for order ${order.code}: ${error.message || 'Unknown error'} (${Date.now() - startTime}ms)`, 'SquarePaymentHandler');
            return {
                amount: order.total,
                state: 'Declined' as const,
                errorMessage: error.message || 'Square payment creation failed',
                metadata: { error: error.message },
            };
        }
    },

    /**
     * settlePayment - actually capture the money (cha-ching moment) 💰
     * Called after order is confirmed and we're ready to take the funds
     * Completes the payment that was previously authorized
     */
    settlePayment: async (ctx, order, payment, args): Promise<SettlePaymentResult | SettlePaymentErrorResult> => {
        const startTime = Date.now();
        try {
            const client = getSquareClient(); // Use cached client

            const squarePaymentId = payment.transactionId;

            if (!squarePaymentId) {
                // Can't settle without the payment ID, this shouldn't happen but safety first
                Logger.warn(`Settlement failed: Missing payment ID for order ${order.code}`, 'SquarePaymentHandler');
                return {
                    success: false as const,
                    errorMessage: 'Missing Square payment ID - cannot settle payment',
                };
            }

            // Tell Square to complete the payment (capture the authorized funds) with timeout
            const response = await withTimeout(
                client.payments.complete({ paymentId: squarePaymentId }),
                30000,
                'Square payment settlement timeout'
            );
            
            const completedPayment = response.payment;

            if (completedPayment && completedPayment.status === 'COMPLETED') {
                // Money secured, order fulfilled, customer happy, business thriving 📈
                Logger.info(`Payment settled: Order ${order.code}, TxID ${completedPayment.id}, ${Date.now() - startTime}ms`, 'SquarePaymentHandler');
                return {
                    success: true as const,
                    metadata: {
                        squarePaymentId: completedPayment.id,
                        status: completedPayment.status,
                        completedAt: new Date().toISOString(),
                    },
                };
            } else {
                // Payment didn't complete properly, something sus happened
                return {
                    success: false as const,
                    errorMessage: `Square payment not completed. Status: ${completedPayment?.status}`,
                    metadata: { status: completedPayment?.status },
                };
            }

        } catch (error: any) {
            Logger.error(`Payment settlement failed for order ${order.code}: ${error.message || 'Unknown error'} (${Date.now() - startTime}ms)`, 'SquarePaymentHandler');
            return {
                success: false as const,
                errorMessage: error.message || 'Failed to settle Square payment',
                metadata: { error: error.message },
            };
        }
    },

    /**
     * createRefund - return customer's money (sad business noises) 😔
     * Called when order gets cancelled or customer returns stuff
     * Sends the funds back to their payment method
     */
    createRefund: async (ctx, input, amount, order, payment, args): Promise<CreateRefundResult> => {
        const startTime = Date.now();
        try {
            const client = getSquareClient(); // Use cached client

            const squarePaymentId = payment.transactionId;

            if (!squarePaymentId) {
                // No payment ID = can't refund, this is a problem
                Logger.warn(`Refund failed: Missing payment ID for order ${order.code}`, 'SquarePaymentHandler');
                return {
                    state: 'Failed' as const,
                    metadata: { error: 'Missing Square payment ID' },
                };
            }

            // Use deterministic idempotency key for refunds too
            const idempotencyKey = `${order.code}-refund-${payment.id}-${Date.now()}`;

            // Hit Square refunds API to send the money back with timeout protection
            const response = await withTimeout(
                client.refunds.refundPayment({
                    idempotencyKey, // Deterministic key prevents duplicate refunds
                    paymentId: squarePaymentId,
                    amountMoney: {
                        amount: BigInt(amount), // Amount in cents to refund
                        currency: order.currencyCode as any, // Vendure uses CurrencyCode, Square uses Currency
                    },
                    reason: input.reason || 'Customer refund request',
                }),
                30000,
                'Square refund timeout'
            );

            const refund = response.refund;

            if (refund && (refund.status === 'COMPLETED' || refund.status === 'PENDING')) {
                // Refund processed, customer getting their money back ✅
                Logger.info(`Refund processed: Order ${order.code}, RefundID ${refund.id}, Amount ${amount}, ${Date.now() - startTime}ms`, 'SquarePaymentHandler');
                return {
                    state: 'Settled' as const, // Refund successful
                    transactionId: refund.id || '',
                    metadata: {
                        squareRefundId: refund.id,
                        status: refund.status,
                        refundedAt: new Date().toISOString(),
                    },
                };
            } else {
                // Refund didn't go through properly
                return {
                    state: 'Failed' as const,
                    metadata: { error: `Refund failed with status: ${refund?.status}` },
                };
            }

        } catch (error: any) {
            Logger.error(`Refund failed for order ${order.code}: ${error.message || 'Unknown error'} (${Date.now() - startTime}ms)`, 'SquarePaymentHandler');
            return {
                state: 'Failed' as const,
                metadata: { error: error.message || 'Refund failed' },
            };
        }
    },
});