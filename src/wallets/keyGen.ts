import { Keypair } from "@solana/web3.js";
import * as fs from 'fs';
import bs58 from 'bs58';

const NUMBER_OF_WALLETS = 100;

export const createWallets = () => {
    try {
        let existingWallets = [];
        
        // Try to read existing wallets
        try {
            const existingContent = fs.readFileSync('./src/wallets/keysList.ts', 'utf-8');
            const match = existingContent.match(/export const walletsList = (\[[\s\S]*\]);/);
            if (match && match[1]) {
                existingWallets = JSON.parse(match[1]);
            }
        } catch (err) {
            existingWallets = [];
        }
        
        const newWallets = [];
        for (let i = 0; i < NUMBER_OF_WALLETS; i++) {
            const wallet = Keypair.generate();
            
            const walletData = {
                publicKey: wallet.publicKey.toString(),
                privateKey: bs58.encode(wallet.secretKey)
            };
            
            newWallets.push(walletData);
        }
        
        const allWallets = [...existingWallets, ...newWallets];
        
        const fileContent = `export const walletsList = ${JSON.stringify(allWallets, null, 2)};`;
        fs.writeFileSync('./src/wallets/keysList.ts', fileContent);
        
        return { 
            success: true, 
            message: `Successfully created ${NUMBER_OF_WALLETS} new wallets. Total wallets: ${allWallets.length}` 
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return { success: false, message: `Failed to create wallets: ${errorMessage}` };
    }
};

// Directly execute the function
const result = createWallets();
console.log(result.message);