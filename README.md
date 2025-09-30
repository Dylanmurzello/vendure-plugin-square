# 💳 Vendure Square Payment Plugin

**Official Square payment integration for Vendure e-commerce platform**

Process real payments through Square with full PCI compliance, automatic tokenization, and support for authorization, settlement, and refunds.

[![npm version](https://img.shields.io/npm/v/vendure-plugin-square.svg)](https://www.npmjs.com/package/vendure-plugin-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ✨ Features

- 💳 **Full Payment Lifecycle** - Authorization, settlement, and refunds
- 🔒 **PCI Compliant** - Card data never touches your server
- 🌍 **Multi-Currency Support** - All Square-supported currencies
- 🧪 **Sandbox Testing** - Complete test environment with Square test cards
- 📊 **Transaction Metadata** - Full Square transaction details stored
- 🔄 **Idempotent Operations** - Prevents duplicate charges
- ⚡ **TypeScript** - Full type safety with TypeScript definitions
- 🛡️ **Error Handling** - Comprehensive error states and messages

---

## 📦 Installation

```bash
npm install vendure-plugin-square square
```

**Peer Dependencies:**
- `@vendure/core`: ^3.0.0
- `square`: ^43.0.0

---

## 🚀 Quick Start

### 1. Get Square Credentials

1. Create a Square Developer account at https://developer.squareup.com
2. Create a new application
3. Get your credentials:
   - **Application ID** (for Web Payments SDK)
   - **Access Token** (for backend API)
   - **Location ID** (from your Square locations)

### 2. Configure Backend

Add to your `vendure-config.ts`:

```typescript
import { SquarePlugin, squarePaymentHandler } from 'vendure-plugin-square';

export const config: VendureConfig = {
  // ... other config
  paymentOptions: {
    paymentMethodHandlers: [squarePaymentHandler],
  },
  plugins: [
    SquarePlugin.init({
      accessToken: process.env.SQUARE_ACCESS_TOKEN!,
      environment: process.env.SQUARE_ENVIRONMENT as 'sandbox' | 'production',
      locationId: process.env.SQUARE_LOCATION_ID!,
    }),
    // ... other plugins
  ],
};
```

### 3. Environment Variables

Add to your `.env`:

```bash
# Square Configuration
SQUARE_ACCESS_TOKEN=your_square_access_token
SQUARE_ENVIRONMENT=sandbox  # or 'production'
SQUARE_LOCATION_ID=your_location_id
```

### 4. Create Payment Method in Admin

1. Login to Vendure Admin UI
2. Go to **Settings → Payment methods**
3. Click **"Create new payment method"**
4. Configure:
   - **Code:** `square-payment`
   - **Handler:** Select "Square Payment"
   - **Enabled:** ON
5. Save

---

## 🎨 Frontend Integration

### Install Square Web Payments SDK

Add the Square SDK to your storefront:

```typescript
import { useEffect, useState } from 'react';

// Load Square SDK
useEffect(() => {
  const script = document.createElement('script');
  script.src = 'https://sandbox.web.squarecdn.com/v1/square.js'; // or production URL
  script.async = true;
  document.body.appendChild(script);
}, []);
```

### Initialize Payment Form

```typescript
const payments = Square.payments(
  process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID,
  process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
);

const card = await payments.card();
await card.attach('#card-container');

// Tokenize card when submitting
const result = await card.tokenize();
const token = result.token;
```

### Submit Payment

```typescript
import { addPaymentToOrder } from '@vendure/core';

const paymentResult = await addPaymentToOrder({
  method: 'square-payment',
  metadata: {
    sourceId: token, // Square payment token
  },
});
```

---

## 🔄 Payment Flow

### Authorization Flow (Two-Step)

By default, payments are **authorized** but not captured:

1. Customer submits payment
2. Square authorizes payment (reserves funds)
3. Order state: **PaymentAuthorized**
4. Admin settles payment in Vendure Admin
5. Square captures funds
6. Order state: **PaymentSettled**

**Benefits:**
- Verify inventory before capturing
- Cancel without refunding
- Better fraud protection

### Auto-Settlement (One-Step)

To automatically capture payments, modify the handler:

```typescript
// In square-payment-handler.ts, line ~92
autocomplete: true,  // Change from false to true
```

---

## 🧪 Testing

### Sandbox Mode

Use Square's test card numbers:

| Card Number | Scenario |
|-------------|----------|
| `4111 1111 1111 1111` | Successful charge |
| `4000 0000 0000 0002` | Card declined |
| `4000 0000 0000 0341` | Insufficient funds |

**Test Card Details:**
- **CVV:** Any 3 digits (e.g., `111`)
- **Expiration:** Any future date (e.g., `12/25`)
- **ZIP Code:** Any 5 digits (e.g., `90210`)

More test values: https://developer.squareup.com/docs/devtools/sandbox/payments

---

## 🛠️ API Reference

### SquarePlugin.init(options)

Initialize the plugin with Square credentials.

**Parameters:**

| Option | Type | Description |
|--------|------|-------------|
| `accessToken` | `string` | Square API access token (required) |
| `environment` | `'sandbox' \| 'production'` | Square environment (required) |
| `locationId` | `string` | Square location ID (required) |

**Example:**

```typescript
SquarePlugin.init({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: 'sandbox',
  locationId: process.env.SQUARE_LOCATION_ID!,
})
```

### squarePaymentHandler

Payment method handler with code `'square-payment'`.

**Methods:**

- **createPayment**: Authorizes payment with Square
- **settlePayment**: Captures authorized payment
- **createRefund**: Processes full or partial refunds

---

## 🔐 Security

### PCI Compliance

- ✅ Card data handled entirely by Square
- ✅ Single-use payment tokens
- ✅ No sensitive data stored on your server
- ✅ HTTPS required for production

### Best Practices

- Store access tokens in environment variables
- Never commit credentials to version control
- Use sandbox for development/testing
- Enable HTTPS on production domains
- Regularly rotate access tokens

---

## 🐛 Troubleshooting

### "Payment method not found"

**Solution:** Create payment method in Vendure Admin with handler code `'square-payment'`

### "Square SDK not loaded"

**Solution:** Ensure Square Web Payments SDK script is loaded before initializing payment form

### "Missing Square payment token"

**Solution:** Card tokenization failed - check card details or Square SDK initialization

### "Authentication failed"

**Solution:** Verify Square access token and environment (sandbox vs production)

---

## 📚 Documentation

### Square Developer Resources

- [Square Developer Portal](https://developer.squareup.com/)
- [Payments API Guide](https://developer.squareup.com/docs/payments-api/overview)
- [Web Payments SDK](https://developer.squareup.com/docs/web-payments/overview)
- [Testing Guide](https://developer.squareup.com/docs/devtools/sandbox/payments)

### Vendure Resources

- [Vendure Docs](https://docs.vendure.io/)
- [Payment Integration Guide](https://docs.vendure.io/guides/core-concepts/payment/)
- [Plugin Development](https://docs.vendure.io/guides/developer-guide/plugins/)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
git clone https://github.com/Dylanmurzello/vendure-plugin-square.git
cd vendure-plugin-square
npm install
npm run build
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 💪 Credits

Built with ❤️ for the Vendure community

**Special Thanks:**
- Vendure team for the amazing e-commerce framework
- Square for their robust payment APIs
- The open-source community

---

**Questions or issues?** Open an issue on [GitHub](https://github.com/yourusername/vendure-plugin-square/issues)

**Want to contribute?** PRs are always welcome! 🎉
