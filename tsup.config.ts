import { defineConfig } from "tsup";
export default defineConfig({    
    entry: ['src/main.ts',
         'src/wallets/transferTest.ts', 'src/wallets/solMix.ts',
         'src/wallets/checkBalances.ts', 'src/wallets/recoverSol.ts',
         'src/wallets/keyGen.ts'],
    outDir: 'dist',
    format: ['esm'],
    target: 'es2022',
    sourcemap: true,
    clean: true,  
    splitting: false,
    dts: true,
    minify: true})