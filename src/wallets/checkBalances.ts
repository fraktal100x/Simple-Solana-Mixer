import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { walletsList } from "./keysList";
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.RPC_URL??'';

async function checkAllBalances() {
    const connection = new Connection(RPC_URL, "confirmed");
    
    let totalSOL = 0;
    console.log("\nWallets with balance:");
    
    for (let i = 0; i < walletsList.length; i++) {
        const wallet = walletsList[i];
        const pubKey = new PublicKey(wallet.publicKey);
        const balance = await connection.getBalance(pubKey);
        
        if (balance > 0) {
            const solBalance = balance / LAMPORTS_PER_SOL;
            console.log(`Wallet ${i}: ${pubKey.toString()} = ${solBalance} SOL`);
            totalSOL += solBalance;
        }
    }
    
    console.log(`\nTotal SOL across all wallets: ${totalSOL}`);
}

checkAllBalances();