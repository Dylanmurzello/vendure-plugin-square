import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { squarePaymentHandler, setSquareOptions } from './square-payment-handler';

// CREATED: 2025-09-30 - Square payment plugin registration
// Wraps the payment handler and registers it with Vendure's payment system
// This is what makes Square show up as a payment option in checkout 🎯

/**
 * Square Payment Plugin Options
 * Get these from Square Developer Dashboard: https://developer.squareup.com/apps
 */
export interface SquarePluginOptions {
    /** Square API access token (sandbox or production) */
    accessToken: string;
    /** 'sandbox' for testing, 'production' for real money moves */
    environment: 'sandbox' | 'production';
    /** Square location ID where payments are processed */
    locationId: string;
}

/**
 * Square Payment Plugin - integrates Square as a payment method
 * 
 * Usage in vendure-config.ts:
 * ```typescript
 * plugins: [
 *   SquarePlugin.init({
 *     accessToken: process.env.SQUARE_ACCESS_TOKEN,
 *     environment: process.env.SQUARE_ENVIRONMENT as 'sandbox' | 'production',
 *     locationId: process.env.SQUARE_LOCATION_ID,
 *   })
 * ]
 * ```
 * 
 * Handles:
 * - Payment authorization (when order placed)
 * - Payment settlement (when order confirmed)
 * - Refunds (when order cancelled)
 * 
 * No dummy payment energy here, this is the real deal 💪
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    // Handler registered directly in vendure-config.ts for proper initialization order
})
export class SquarePlugin {
    /**
     * Initialize the Square plugin with your credentials
     * Get these from Square Developer Dashboard: https://developer.squareup.com/apps
     * 
     * @param options - Square API configuration
     */
    static init(options: SquarePluginOptions) {
        // Store options for use in payment handler
        setSquareOptions(options);
        return SquarePlugin;
    }
}