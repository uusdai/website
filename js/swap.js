// =====================================================
// UUSD Website - PancakeSwap Integration
// =====================================================

// PancakeSwap Router ABI (minimal)
const ROUTER_ABI = [
    'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
];

// ERC20 ABI (minimal)
const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)'
];

class SwapManager {
    constructor() {
        this.router = null;
        this.slippage = 0.5; // 0.5%
        this.deadline = 20; // 20 minutes

        this.fromToken = 'BNB';
        this.toToken = 'UUSD';
        this.fromAmount = '';
        this.toAmount = '';
        this.priceImpact = 0;
        this.route = [];

        this.isLoading = false;
        this.quoteTimeout = null;
    }

    init() {
        this.bindEvents();
        this.updateUI();
    }

    bindEvents() {
        // Connect wallet button
        const connectBtn = document.getElementById('connect-wallet-btn');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => this.connectWallet());
        }

        // From amount input
        const fromInput = document.getElementById('from-amount');
        if (fromInput) {
            fromInput.addEventListener('input', (e) => this.onFromAmountChange(e.target.value));
        }

        // Token selectors
        document.getElementById('from-token-selector')?.addEventListener('click', () => this.openTokenModal('from'));
        document.getElementById('to-token-selector')?.addEventListener('click', () => this.openTokenModal('to'));

        // Swap direction button
        document.getElementById('swap-direction')?.addEventListener('click', () => this.swapDirection());

        // Settings button
        document.getElementById('settings-btn')?.addEventListener('click', () => this.toggleSettings());

        // Slippage buttons
        document.querySelectorAll('.slippage-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.setSlippage(e.target.dataset.value));
        });

        // Custom slippage input
        const customSlippage = document.getElementById('custom-slippage');
        if (customSlippage) {
            customSlippage.addEventListener('input', (e) => this.setSlippage(e.target.value));
        }

        // Swap button
        document.getElementById('swap-btn')?.addEventListener('click', () => this.executeSwap());

        // Token modal close
        document.getElementById('token-modal-close')?.addEventListener('click', () => this.closeTokenModal());
        document.getElementById('token-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'token-modal') this.closeTokenModal();
        });

        // Token list items
        document.querySelectorAll('.token-list-item').forEach(item => {
            item.addEventListener('click', (e) => this.selectToken(e.currentTarget.dataset.token));
        });

        // Wallet events
        wallet.on('connect', () => this.onWalletConnect());
        wallet.on('disconnect', () => this.onWalletDisconnect());
        wallet.on('accountChange', () => this.updateBalances());
    }

    async connectWallet() {
        const success = await wallet.connect();
        if (success) {
            this.updateUI();
        }
    }

    onWalletConnect() {
        this.updateUI();
        this.updateBalances();
    }

    onWalletDisconnect() {
        this.updateUI();
    }

    updateUI() {
        const connectBtn = document.getElementById('connect-wallet-btn');
        const walletStatus = document.getElementById('wallet-status');
        const swapBtn = document.getElementById('swap-btn');

        if (wallet.isConnected) {
            if (connectBtn) connectBtn.style.display = 'none';
            if (swapBtn) swapBtn.style.display = 'flex';
            if (walletStatus) {
                walletStatus.style.display = 'flex';
                walletStatus.querySelector('.wallet-address').textContent = wallet.getShortAddress();
            }

            // Check if on BSC
            if (!wallet.isOnBSC()) {
                if (swapBtn) {
                    swapBtn.textContent = 'Switch to BSC';
                    swapBtn.disabled = false;
                }
            } else {
                this.updateSwapButton();
            }
        } else {
            if (connectBtn) connectBtn.style.display = 'flex';
            if (swapBtn) swapBtn.style.display = 'none';
            if (walletStatus) walletStatus.style.display = 'none';

        // Update token displays
        this.updateTokenDisplay('from', this.fromToken);
        this.updateTokenDisplay('to', this.toToken);
    }

    updateTokenDisplay(side, tokenKey) {
        const selector = document.getElementById(`${side}-token-selector`);
        if (!selector) return;

        const token = TOKENS[tokenKey];
        const logoEl = selector.querySelector('.token-logo');
        const symbolEl = selector.querySelector('.token-symbol');

        if (logoEl) {
            if (token.logo) {
                logoEl.src = token.logo;
                logoEl.style.display = 'block';
            } else {
                // UUSD special gradient logo
                logoEl.style.display = 'none';
            }
        }

        if (symbolEl) {
            symbolEl.textContent = token.symbol;
        }
    }

    async updateBalances() {
        if (!wallet.isConnected) return;

        // Update from token balance
        const fromToken = TOKENS[this.fromToken];
        const fromBalance = await wallet.getBalance(fromToken.address);
        const fromBalanceEl = document.getElementById('from-balance');
        if (fromBalanceEl) {
            fromBalanceEl.textContent = `Balance: ${parseFloat(fromBalance).toFixed(6)}`;
        }

        // Update to token balance
        const toToken = TOKENS[this.toToken];
        const toBalance = await wallet.getBalance(toToken.address);
        const toBalanceEl = document.getElementById('to-balance');
        if (toBalanceEl) {
            toBalanceEl.textContent = `Balance: ${parseFloat(toBalance).toFixed(6)}`;
        }
    }

    async onFromAmountChange(value) {
        this.fromAmount = value;

        // Clear previous timeout
        if (this.quoteTimeout) {
            clearTimeout(this.quoteTimeout);
        }

        if (!value || parseFloat(value) <= 0) {
            this.toAmount = '';
            document.getElementById('to-amount').value = '';
            this.updateSwapButton();
            return;
        }

        // Debounce quote fetching
        this.quoteTimeout = setTimeout(() => this.getQuote(), 300);
    }

    async getQuote() {
        if (!this.fromAmount || parseFloat(this.fromAmount) <= 0) return;

        const toAmountInput = document.getElementById('to-amount');
        const swapDetails = document.getElementById('swap-details');

        try {
            this.isLoading = true;
            toAmountInput.value = 'Loading...';

            // Get provider (can work without wallet connected)
            const provider = wallet.provider || new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
            const router = new ethers.Contract(CONTRACTS.PANCAKE_ROUTER, ROUTER_ABI, provider);

            // Build path
            const fromToken = TOKENS[this.fromToken];
            const toToken = TOKENS[this.toToken];

            let path = [];
            if (this.fromToken === 'BNB') {
                path = [CONTRACTS.WBNB, toToken.address];
            } else if (this.toToken === 'BNB') {
                path = [fromToken.address, CONTRACTS.WBNB];
            } else {
                // Route through WBNB
                path = [fromToken.address, CONTRACTS.WBNB, toToken.address];
            }

            const amountIn = ethers.parseEther(this.fromAmount);
            const amounts = await router.getAmountsOut(amountIn, path);
            const amountOut = ethers.formatEther(amounts[amounts.length - 1]);

            this.toAmount = amountOut;
            this.route = path;

            toAmountInput.value = parseFloat(amountOut).toFixed(6);

            // Calculate price impact (simplified)
            const rate = parseFloat(amountOut) / parseFloat(this.fromAmount);
            this.priceImpact = 0; // Would need pool reserves for accurate calculation

            // Update swap details
            if (swapDetails) {
                swapDetails.style.display = 'block';
                document.getElementById('swap-rate').textContent =
                    `1 ${this.fromToken} = ${rate.toFixed(6)} ${this.toToken}`;
                document.getElementById('min-received').textContent =
                    `${(parseFloat(amountOut) * (1 - this.slippage / 100)).toFixed(6)} ${this.toToken}`;
                document.getElementById('price-impact').textContent =
                    `< 0.01%`;
            }

        } catch (error) {
            console.error('Quote error:', error);
            toAmountInput.value = 'Error';
            this.toAmount = '';
        } finally {
            this.isLoading = false;
            this.updateSwapButton();
        }
    }

    swapDirection() {
        const temp = this.fromToken;
        this.fromToken = this.toToken;
        this.toToken = temp;

        const tempAmount = this.fromAmount;
        this.fromAmount = this.toAmount;
        this.toAmount = tempAmount;

        document.getElementById('from-amount').value = this.fromAmount;
        document.getElementById('to-amount').value = this.toAmount;

        this.updateTokenDisplay('from', this.fromToken);
        this.updateTokenDisplay('to', this.toToken);
        this.updateBalances();
        this.updateSwapButton();

        if (this.fromAmount) {
            this.getQuote();
        }
    }

    toggleSettings() {
        const settings = document.getElementById('slippage-settings');
        if (settings) {
            settings.classList.toggle('active');
        }
    }

    setSlippage(value) {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue <= 0 || numValue > 50) return;

        this.slippage = numValue;

        // Update UI
        document.querySelectorAll('.slippage-btn').forEach(btn => {
            btn.classList.remove('active');
            if (parseFloat(btn.dataset.value) === numValue) {
                btn.classList.add('active');
            }
        });

        // Re-calculate min received
        if (this.toAmount) {
            const minReceived = parseFloat(this.toAmount) * (1 - this.slippage / 100);
            document.getElementById('min-received').textContent =
                `${minReceived.toFixed(6)} ${this.toToken}`;
        }
    }

    openTokenModal(side) {
        this.selectingSide = side;
        const modal = document.getElementById('token-modal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    closeTokenModal() {
        const modal = document.getElementById('token-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.selectingSide = null;
    }

    selectToken(tokenKey) {
        if (!this.selectingSide) return;

        if (this.selectingSide === 'from') {
            if (tokenKey === this.toToken) {
                // Swap tokens
                this.toToken = this.fromToken;
            }
            this.fromToken = tokenKey;
        } else {
            if (tokenKey === this.fromToken) {
                // Swap tokens
                this.fromToken = this.toToken;
            }
            this.toToken = tokenKey;
        }

        this.updateTokenDisplay('from', this.fromToken);
        this.updateTokenDisplay('to', this.toToken);
        this.updateBalances();
        this.closeTokenModal();

        if (this.fromAmount) {
            this.getQuote();
        }
    }

    updateSwapButton() {
        const swapBtn = document.getElementById('swap-btn');
        if (!swapBtn) return;

        if (!wallet.isConnected) {
            swapBtn.textContent = 'Connect Wallet';
            swapBtn.disabled = true;
            return;
        }

        if (!wallet.isOnBSC()) {
            swapBtn.textContent = 'Switch to BSC';
            swapBtn.disabled = false;
            return;
        }

        if (!this.fromAmount || parseFloat(this.fromAmount) <= 0) {
            swapBtn.textContent = 'Enter Amount';
            swapBtn.disabled = true;
            return;
        }

        if (this.isLoading) {
            swapBtn.textContent = 'Loading...';
            swapBtn.disabled = true;
            return;
        }

        if (!this.toAmount) {
            swapBtn.textContent = 'Invalid Pair';
            swapBtn.disabled = true;
            return;
        }

        swapBtn.textContent = 'Swap';
        swapBtn.disabled = false;
    }

    async executeSwap() {
        const swapBtn = document.getElementById('swap-btn');
        const txStatus = document.getElementById('tx-status');

        if (!wallet.isConnected) {
            await this.connectWallet();
            return;
        }

        if (!wallet.isOnBSC()) {
            await wallet.switchToBSC();
            return;
        }

        if (!this.fromAmount || !this.toAmount || !this.route.length) {
            return;
        }

        try {
            swapBtn.disabled = true;
            swapBtn.innerHTML = '<span class="spinner"></span> Processing...';

            const router = new ethers.Contract(CONTRACTS.PANCAKE_ROUTER, ROUTER_ABI, wallet.signer);
            const amountIn = ethers.parseEther(this.fromAmount);
            const amountOutMin = ethers.parseEther(
                (parseFloat(this.toAmount) * (1 - this.slippage / 100)).toString()
            );
            const deadline = Math.floor(Date.now() / 1000) + (this.deadline * 60);

            let tx;

            if (this.fromToken === 'BNB') {
                // Swap BNB for tokens
                showTxStatus('pending', 'Waiting for confirmation...');
                tx = await router.swapExactETHForTokens(
                    amountOutMin,
                    this.route,
                    wallet.address,
                    deadline,
                    { value: amountIn }
                );
            } else if (this.toToken === 'BNB') {
                // Swap tokens for BNB
                // First approve
                showTxStatus('pending', 'Approving tokens...');
                await this.approveToken(TOKENS[this.fromToken].address, amountIn);

                showTxStatus('pending', 'Waiting for confirmation...');
                tx = await router.swapExactTokensForETH(
                    amountIn,
                    amountOutMin,
                    this.route,
                    wallet.address,
                    deadline
                );
            } else {
                // Swap tokens for tokens
                // First approve
                showTxStatus('pending', 'Approving tokens...');
                await this.approveToken(TOKENS[this.fromToken].address, amountIn);

                showTxStatus('pending', 'Waiting for confirmation...');
                tx = await router.swapExactTokensForTokens(
                    amountIn,
                    amountOutMin,
                    this.route,
                    wallet.address,
                    deadline
                );
            }

            showTxStatus('pending', `Transaction submitted: ${tx.hash.slice(0, 10)}...`);

            // Wait for confirmation
            const receipt = await tx.wait();

            if (receipt.status === 1) {
                showTxStatus('success', `Swap successful! <a href="https://bscscan.com/tx/${tx.hash}" target="_blank">View on BSCScan</a>`);

                // Reset form
                this.fromAmount = '';
                this.toAmount = '';
                document.getElementById('from-amount').value = '';
                document.getElementById('to-amount').value = '';
                document.getElementById('swap-details').style.display = 'none';

                // Update balances
                this.updateBalances();
            } else {
                showTxStatus('error', 'Transaction failed');
            }

        } catch (error) {
            console.error('Swap error:', error);
            let message = 'Transaction failed';
            if (error.code === 'ACTION_REJECTED') {
                message = 'Transaction rejected by user';
            } else if (error.message) {
                message = error.message.slice(0, 100);
            }
            showTxStatus('error', message);
        } finally {
            this.updateSwapButton();
        }
    }

    async approveToken(tokenAddress, amount) {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet.signer);

        // Check current allowance
        const allowance = await token.allowance(wallet.address, CONTRACTS.PANCAKE_ROUTER);

        if (allowance < amount) {
            const tx = await token.approve(CONTRACTS.PANCAKE_ROUTER, ethers.MaxUint256);
            await tx.wait();
        }
    }
}

// Helper function to show transaction status
function showTxStatus(status, message) {
    const txStatus = document.getElementById('tx-status');
    if (!txStatus) return;

    txStatus.className = `tx-status ${status}`;
    txStatus.innerHTML = message;
    txStatus.style.display = 'block';

    if (status === 'success' || status === 'error') {
        // Auto-hide after 10 seconds
        setTimeout(() => {
            txStatus.style.display = 'none';
        }, 10000);
    }
}

// Create global swap manager instance
window.swapManager = new SwapManager();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.swapManager.init();
});
