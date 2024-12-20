import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { walletsList } from "./keysList";
import dotenv from 'dotenv';
import bs58 from 'bs58';

dotenv.config();

const TRANSACTION_FEE = 5000; // 0.000005 SOL per transaction
const TARGET_WALLET = process.env.TARGET;
const MIN_DELAY = 3000;  // 3 seconds minimum delay
const MAX_DELAY = 10000; // 10 seconds maximum delay
const RPC_URL = process.env.RPC_URL??''; 
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 3000;
const MAX_RETRY_DELAY = 9000;

async function checkAllBalances(connection: Connection, wallets: any[]) {
    console.log("\nWallets with balance:");
    let totalBalance = 0;
    
    for (let i = 0; i < wallets.length; i++) {
        try {
            const balance = await connection.getBalance(wallets[i].publicKey);
            if (balance > 0) {
                console.log(`Wallet ${i}: ${wallets[i].publicKey.toString()} = ${balance / LAMPORTS_PER_SOL} SOL`);
                totalBalance += balance;
            }
        } catch (error) {
            console.log(`Error checking wallet ${i}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
                const balance = await connection.getBalance(wallets[i].publicKey);
                if (balance > 0) {
                    console.log(`Wallet ${i}: ${wallets[i].publicKey.toString()} = ${balance / LAMPORTS_PER_SOL} SOL`);
                    totalBalance += balance;
                }
            } catch (retryError) {
                console.log(`Failed to check wallet ${i} after retry`);
            }
        }
    }
    
    console.log(`\nTotal SOL across all wallets: ${totalBalance / LAMPORTS_PER_SOL}\n`);
}

async function executeTransactionWithRetry(
    connection: Connection,
    from: any,
    to: any,
    amount: number,
    retryCount = 0
): Promise<string | null> {
    try {
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: from.publicKey,
                toPubkey: to.publicKey,
                lamports: amount,
            })
        );

        console.log(`\nTransaction Details:`);
        console.log(`From: ${from.publicKey.toString()}`);
        console.log(`To: ${to.publicKey.toString()}`);
        console.log(`Amount: ${amount / LAMPORTS_PER_SOL} SOL`);

        const signature = await connection.sendTransaction(
            transaction,
            [from]
        );

        // Modified confirmation logic with retries
        let confirmed = false;
        let confirmRetries = 3;
        
        while (!confirmed && confirmRetries > 0) {
            try {
                await connection.confirmTransaction(signature, 'confirmed');
                confirmed = true;
                console.log(`Transaction confirmed: ${signature}`);
                console.log(`Solscan: https://solscan.io/tx/${signature}\n`);
            } catch (confirmError) {
                confirmRetries--;
                if (confirmRetries > 0) {
                    console.log(`Transaction confirmation timeout, retrying... (${confirmRetries} attempts left)`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } else {
                    // Check if transaction was actually successful despite timeout
                    try {
                        const status = await connection.getSignatureStatus(signature);
                        if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
                            console.log(`Transaction found successful after timeout: ${signature}`);
                            console.log(`Solscan: https://solscan.io/tx/${signature}\n`);
                            return signature;
                        }
                    } catch (statusError) {
                        console.log("Could not verify transaction status");
                    }
                }
            }
        }

        if (confirmed) {
            return signature;
        }

        if (retryCount < MAX_RETRIES) {
            console.log(`Transaction might have failed, retrying... (${MAX_RETRIES - retryCount} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, INITIAL_RETRY_DELAY));
            return executeTransactionWithRetry(connection, from, to, amount, retryCount + 1);
        }

        return null;

    } catch (error: any) {
        if (error.message?.includes('429') && retryCount < MAX_RETRIES) {
            const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, retryCount), MAX_RETRY_DELAY);
            console.log(`Rate limited, waiting ${delay/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return executeTransactionWithRetry(connection, from, to, amount, retryCount + 1);
        }
        
        console.error("Transaction failed:", error);
        console.log(`Failed transaction details:`);
        console.log(`From: ${from.publicKey.toString()}`);
        console.log(`To: ${to.publicKey.toString()}`);
        console.log(`Amount: ${amount / LAMPORTS_PER_SOL} SOL\n`);
        
        if (retryCount < MAX_RETRIES) {
            console.log(`Retrying transaction... (${MAX_RETRIES - retryCount} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, INITIAL_RETRY_DELAY));
            return executeTransactionWithRetry(connection, from, to, amount, retryCount + 1);
        }
        
        return null;
    }
}

async function mixSol() {
    try {
        const connection = new Connection(RPC_URL, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000
        });
        
        const wallets = walletsList.map(wallet => ({
            publicKey: new PublicKey(wallet.publicKey),
            secretKey: bs58.decode(wallet.privateKey)
        }));

        const targetWallet = new PublicKey(TARGET_WALLET!);
        
        // Check initial balance with retries
        let initialBalance = 0;
        let retries = 6;
        
        while (retries > 0) {
            try {
                initialBalance = await connection.getBalance(wallets[0].publicKey);
                console.log(`Starting linear transfer from wallet: ${wallets[0].publicKey.toString()}`);
                console.log(`Initial balance: ${initialBalance / LAMPORTS_PER_SOL} SOL`);
                break;
            } catch (error) {
                console.log(`Error getting balance, retrying... (${retries} attempts left)`);
                retries--;
                if (retries === 0) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (initialBalance <= TRANSACTION_FEE) {
            console.log(`Initial wallet doesn't have enough SOL. Has: ${initialBalance / LAMPORTS_PER_SOL} SOL`);
            return false;
        }

        // Linear transfer through all wallets
        for (let i = 0; i < wallets.length - 1; i++) {
            const currentWallet = wallets[i];
            const nextWallet = wallets[i + 1];
            
            const currentBalance = await connection.getBalance(currentWallet.publicKey);
            if (currentBalance <= TRANSACTION_FEE) {
                console.log(`Insufficient balance in wallet ${i}`);
                continue;
            }

            const transferAmount = currentBalance - TRANSACTION_FEE;
            console.log(`\nTransferring ${transferAmount / LAMPORTS_PER_SOL} SOL from wallet ${i} to ${i + 1}`);

            const signature = await executeTransactionWithRetry(
                connection,
                currentWallet,
                nextWallet,
                transferAmount
            );

            if (signature) {
                // Verify the transfer
                const newBalance = await connection.getBalance(currentWallet.publicKey);
                if (newBalance > 0) {
                    console.log(`Warning: Wallet ${i} still has ${newBalance / LAMPORTS_PER_SOL} SOL`);
                }

                // Add small delay to avoid rate limits
                const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
                console.log(`Waiting ${delay/6000} seconds before next transfer...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.log(`Failed to transfer from wallet ${i} to ${i + 1}. Stopping.`);
                return false;
            }
        }

        // Final transfer to target wallet
        const lastWallet = wallets[wallets.length - 1];
        const finalBalance = await connection.getBalance(lastWallet.publicKey);
        
        if (finalBalance > TRANSACTION_FEE) {
            console.log(`\nFinal transfer to target wallet`);
            const signature = await executeTransactionWithRetry(
                connection,
                lastWallet,
                { publicKey: targetWallet },
                finalBalance - TRANSACTION_FEE
            );

            if (!signature) {
                console.log('Failed to transfer to target wallet');
                return false;
            }
        }

        // Verify all wallets are empty
        console.log('\nVerifying all wallets are empty...');
        for (let i = 0; i < wallets.length; i++) {
            const balance = await connection.getBalance(wallets[i].publicKey);
            if (balance > 0) {
                console.log(`Warning: Wallet ${i} has remaining balance of ${balance / LAMPORTS_PER_SOL} SOL`);
            }
        }

        return true;

    } catch (error) {
        console.error("Error in mixing:", error);
        return false;
    }
}

// Direct execution
mixSol().then(success => {
    if (success) {
        console.log('Mixing completed successfully!');
    } else {
        console.log('Mixing failed!');
    }
});

export { mixSol };