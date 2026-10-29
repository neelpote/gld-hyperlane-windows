# Gold (GLD) Hyperlane Warp Route - Windows lab

Detailed Windows instructions and nine beginner practicals for a GLD Warp Route between BSC testnet (97) and Ethereum Sepolia (11155111).

The example route was deployed and tested with a real 1 GLD round trip on 29 October 2026. The owner again held all 1,000,000 GLD on BSC after the test. These are test tokens with no physical-gold backing or redemption mechanism.

## Start here

- [31-page Windows step-by-step guide](docs/GLD-Windows-Step-by-Step.pdf)
- [Nine beginner practical sheets in one PDF](docs/GLD-Nine-Beginner-Practicals.pdf)
- [Nine separate practical PDFs](practicals/)
- [Download the Windows kit](downloads/GLD-Windows-Kit.zip)
- [Download all nine separate practicals as a ZIP](downloads/GLD-Nine-Practical-Sheets.zip)
- [Verified deployment and round-trip report](docs/GLD-deployment-report.json)

## Choose a project folder

`windows/existing-route` operates the route already deployed for the owner below. It contains public deployment records and contract addresses. Do not redeploy just to use a different computer.

`windows/fresh-route` creates a separate token and route. It contains a zero collateral-address placeholder and no deployment record. Read the guide before configuring or deploying it.

Windows PowerShell examples use `npm.cmd`. The helpers invoke Hyperlane through Node, avoiding Unix executable paths. No global Hyperlane, WSL, Docker, Foundry, or Git installation is required for the ZIP workflow.

```powershell
# In the chosen existing-route or fresh-route folder:
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad.exe .env
```

Set the account private key and matching public owner address locally. Never put a recovery phrase in HYP_KEY. No private key, recovery phrase, or configured .env is included in this repository. Follow the PDF for account checks, native testnet funding, the fresh-route configure/deploy sequence, and delivery verification.

## Practical variations

1. Inspect the deployed route without moving tokens.
2. Bridge 1 GLD from BSC testnet to Sepolia.
3. Reverse direction and return 1 GLD.
4. Bridge 0.1 GLD.
5. Bridge 5 GLD.
6. Bridge 0.25 GLD to another recipient.
7. Send two separate 0.05 GLD transfers.
8. Check or retry delivery of an existing message.
9. Switch the BSC testnet RPC endpoint and verify state.

## Deployed example

Owner: `0x3ae38EDD6eDfD90180EC897cbF0C5BA527459C83`

| Contract | Address |
| --- | --- |
| BSC testnet Gold ERC-20 | [0x8A0D43b12185587e0561691664728bC3030176A9](https://testnet.bscscan.com/address/0x8A0D43b12185587e0561691664728bC3030176A9) |
| BSC testnet collateral router | [0xf6285188b3EEb57738f80A4ECeF4bABD5DeDd6b6](https://testnet.bscscan.com/address/0xf6285188b3EEb57738f80A4ECeF4bABD5DeDd6b6) |
| Sepolia synthetic GLD token/router | [0x4E2C344358Cd11FAf2CD6454E8c9999D9a45b0E8](https://sepolia.etherscan.io/address/0x4E2C344358Cd11FAf2CD6454E8c9999D9a45b0E8) |

GLD uses 18 decimals. Fresh deployments have different addresses.

## Validation and limits

The underlying on-chain flow was tested on macOS: deployment, both router enrollments, configuration checks, source/destination receipts, mailbox delivery flags, and restored final token balances. The outbound test used CLI self-relaying; the return message was delivered after validator metadata became available. Continuous public relayer service is not guaranteed.

Windows helper syntax and the Node-based launcher were checked in the authoring environment, but a Windows machine was not available for native end-to-end execution. Explorer source-code verification remains incomplete because explorer API keys were not configured.

Dependencies are pinned in each package-lock.json. Hyperlane CLI 45.0.1 uses registry route IDs. Read the guide before changing versions or reusing commands from older tutorials.
