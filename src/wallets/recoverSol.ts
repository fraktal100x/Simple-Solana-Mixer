import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { walletsList } from "./keysList";
import dotenv from 'dotenv';

dotenv.config();

const TRANSACTION_FEE = 5000; // 0.000005 SOL
const MIN_BALANCE_TO_RECOVER = 0.01 * LAMPORTS_PER_SOL; // Only recover from wallets with less than 0.01 SOL

const RPC_URL = process.env.RPC_URL??'';

async function recoverSOL() {
    try {
        const connection = new Connection(RPC_URL, "confirmed");
        
        const wallets = walletsList.map(wallet => ({
            publicKey: new PublicKey(wallet.publicKey),
            secretKey: Buffer.from(wallet.privateKey, 'hex')
        }));

        console.log("Starting SOL recovery process...");
        console.log("Checking all wallet balances...\n");

        let totalRecovered = 0;
        
        // Check all wallets except wallet 0
        for (let i = 1; i < wallets.length; i++) {
            const balance = await connection.getBalance(wallets[i].publicKey);
            
            if (balance > TRANSACTION_FEE) {
                console.log(`Wallet ${i}: ${wallets[i].publicKey.toString()} has ${balance / LAMPORTS_PER_SOL} SOL`);
                
                // Transfer entire balance minus fee
                const transferAmount = balance - TRANSACTION_FEE;
                
                const transaction = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: wallets[i].publicKey,
                        toPubkey: wallets[0].publicKey,
                        lamports: transferAmount,
                    })
                );

                console.log(`Transferring ${transferAmount / LAMPORTS_PER_SOL} SOL to wallet 0...`);
                
                const signature = await connection.sendTransaction(
                    transaction,
                    [wallets[i]]
                );

                await connection.confirmTransaction(signature, "confirmed");
                console.log(`Transfer confirmed: ${signature}\n`);
                
                totalRecovered += transferAmount;
            }
        }

        // Check final balance of wallet 0
        const finalBalance = await connection.getBalance(wallets[0].publicKey);
        
        console.log("\nRecovery complete!");
        console.log(`Total SOL recovered: ${totalRecovered / LAMPORTS_PER_SOL}`);
        console.log(`Wallet 0 final balance: ${finalBalance / LAMPORTS_PER_SOL} SOL`);
        
        return true;

    } catch (error) {
        console.error("Error in recovery:", error);
        return false;
    }
}

// Execute if not in test mode
if (process.env.NODE_ENV !== 'test') {
    recoverSOL().then(success => {
        if (!success) {
            console.log("Recovery failed!");
        }
    });
}

export { recoverSOL };