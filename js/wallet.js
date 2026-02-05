// =====================================================
// UUSD Website - Wallet Connection
// =====================================================

// BSC Network Configuration
const BSC_CHAIN_ID = '0x38'; // 56 in hex
const BSC_CONFIG = {
    chainId: BSC_CHAIN_ID,
    chainName: 'BNB Smart Chain',
    nativeCurrency: {
        name: 'BNB',
        symbol: 'BNB',
        decimals: 18
    },
    rpcUrls: ['https://bsc-dataseed.binance.org/'],
    blockExplorerUrls: ['https://bscscan.com/']
};

// Contract Addresses
const CONTRACTS = {
    UUSD: '0x61a10E8556BEd032eA176330e7F17D6a12a10000',
    // Legacy PancakeSwap V2 Router (kept for reference; Swap page now uses Infinity Universal Router)
    PANCAKE_ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',

    // PancakeSwap Infinity (Liquidity Book / LBAMM) - official addresses
    // Source: https://developer.pancakeswap.finance/contracts/universal-router/addresses
    INFINITY_UNIVERSAL_ROUTER: '0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB',
    // Source: https://developer.pancakeswap.finance/contracts/permit2/addresses
    PERMIT2: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
    // Source: https://developer.pancakeswap.finance/contracts/infinity/resources/addresses
    INFI_VAULT: '0x238a358808379702088667322f80aC48bAd5e6c4',
    INFI_BIN_POOL_MANAGER: '0xC697d2898e0D09264376196696c51D7aBbbAA4a9',
    INFI_BIN_QUOTER: '0xC631f4B0Fc2Dd68AD45f74B2942628db117dD359',

    // UUSD LBAMM PoolId (Infinity Bin pool)
    // Pool page: https://pancakeswap.finance/liquidity/pool/bsc/0xbe4d8fc01cd8287417afe5a709417327406f2f6bb43fa3bf190b5f38721df066
    UUSD_LB_POOL_ID: '0xbe4d8fc01cd8287417afe5a709417327406f2f6bb43fa3bf190b5f38721df066'
};

// Token configurations
const TOKENS = {
    BNB: {
        symbol: 'BNB',
        name: 'BNB',
        decimals: 18,
        address: null, // Native token
        logo: 'https://cryptologos.cc/logos/bnb-bnb-logo.png'
    },
    WBNB: {
        symbol: 'WBNB',
        name: 'Wrapped BNB',
        decimals: 18,
        address: CONTRACTS.WBNB,
        logo: 'https://cryptologos.cc/logos/bnb-bnb-logo.png'
    },
    BUSD: {
        symbol: 'BUSD',
        name: 'Binance USD',
        decimals: 18,
        address: CONTRACTS.BUSD,
        logo: 'https://cryptologos.cc/logos/binance-usd-busd-logo.png'
    },
    USDT: {
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 18,
        address: CONTRACTS.USDT,
        logo: 'https://cryptologos.cc/logos/tether-usdt-logo.png'
    },
    USDC: {
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 18,
        address: CONTRACTS.USDC,
        logo: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png'
    },
    UUSD: {
        symbol: 'UUSD',
        name: 'Unity USD',
        decimals: 18,
        address: CONTRACTS.UUSD,
        logo: 'assets/logo.png'
    }
};

// Wallet State
class WalletManager {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.address = null;
        this.chainId = null;
        this.isConnected = false;

        this.listeners = {
            connect: [],
            disconnect: [],
            chainChange: [],
            accountChange: []
        };

        this.init();
    }

    init() {
        // Check if already connected
        if (typeof window.ethereum !== 'undefined') {
            this.setupEventListeners();
            this.checkConnection();
        }
    }

    setupEventListeners() {
        if (!window.ethereum) return;

        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                this.disconnect();
            } else {
                this.address = accounts[0];
                this.emit('accountChange', this.address);
            }
        });

        window.ethereum.on('chainChanged', (chainId) => {
            this.chainId = chainId;
            this.emit('chainChange', chainId);
            // Reload page on chain change as recommended by MetaMask
            window.location.reload();
        });

        window.ethereum.on('disconnect', () => {
            this.disconnect();
        });
    }

    async checkConnection() {
        try {
            if (!window.ethereum) return;

            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                await this.connect(true);
            }
        } catch (error) {
            console.error('Error checking connection:', error);
        }
    }

    async connect(silent = false) {
        try {
            if (!window.ethereum) {
                if (!silent) {
                    alert('Please install MetaMask or another Web3 wallet to continue.');
                }
                return false;
            }

            // Request account access
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });

            if (accounts.length === 0) {
                throw new Error('No accounts found');
            }

            // Create ethers provider
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            this.address = accounts[0];
            this.chainId = await window.ethereum.request({ method: 'eth_chainId' });
            this.isConnected = true;

            // Check if on BSC
            if (this.chainId !== BSC_CHAIN_ID) {
                await this.switchToBSC();
            }

            this.emit('connect', this.address);
            return true;

        } catch (error) {
            console.error('Connection error:', error);
            if (!silent) {
                alert('Failed to connect wallet: ' + error.message);
            }
            return false;
        }
    }

    async switchToBSC() {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: BSC_CHAIN_ID }]
            });
        } catch (error) {
            // Chain not added, try to add it
            if (error.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [BSC_CONFIG]
                    });
                } catch (addError) {
                    throw new Error('Failed to add BSC network');
                }
            } else {
                throw error;
            }
        }
    }

    disconnect() {
        this.provider = null;
        this.signer = null;
        this.address = null;
        this.chainId = null;
        this.isConnected = false;
        this.emit('disconnect');
    }

    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    getShortAddress() {
        if (!this.address) return '';
        return `${this.address.slice(0, 6)}...${this.address.slice(-4)}`;
    }

    async getBalance(tokenAddress = null) {
        if (!this.provider || !this.address) return '0';

        try {
            if (!tokenAddress) {
                // Native BNB balance
                const balance = await this.provider.getBalance(this.address);
                return ethers.formatEther(balance);
            } else {
                // ERC20 token balance
                const contract = new ethers.Contract(
                    tokenAddress,
                    ['function balanceOf(address) view returns (uint256)'],
                    this.provider
                );
                const balance = await contract.balanceOf(this.address);
                return ethers.formatEther(balance);
            }
        } catch (error) {
            console.error('Error getting balance:', error);
            return '0';
        }
    }

    async addTokenToWallet(token) {
        if (!window.ethereum || !token.address) return false;

        try {
            await window.ethereum.request({
                method: 'wallet_watchAsset',
                params: {
                    type: 'ERC20',
                    options: {
                        address: token.address,
                        symbol: token.symbol,
                        decimals: token.decimals,
                        image: token.logo || ''
                    }
                }
            });
            return true;
        } catch (error) {
            console.error('Error adding token:', error);
            return false;
        }
    }

    isOnBSC() {
        return this.chainId === BSC_CHAIN_ID;
    }
}

// Create global wallet instance
window.wallet = new WalletManager();

// Export
window.CONTRACTS = CONTRACTS;
window.TOKENS = TOKENS;
window.BSC_CHAIN_ID = BSC_CHAIN_ID;
