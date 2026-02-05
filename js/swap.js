// =====================================================
// UUSD Website - PancakeSwap Integration
// =====================================================

// =====================================================
// PancakeSwap Infinity (LBAMM) Swap Flow
//
// We execute swaps via:
// - PancakeSwap Infinity Universal Router (BSC mainnet):
//   https://developer.pancakeswap.finance/contracts/universal-router/addresses
// - PancakeSwap Permit2 (BSC mainnet):
//   https://developer.pancakeswap.finance/contracts/permit2/addresses
// - Infinity BinQuoter / BinPoolManager:
//   https://developer.pancakeswap.finance/contracts/infinity/resources/addresses
//
// Commands (Universal Router):
//   https://github.com/pancakeswap/infinity-universal-router/blob/main/src/libraries/Commands.sol
// Actions (Infinity):
//   https://github.com/pancakeswap/infinity-periphery/blob/main/src/libraries/Actions.sol
// =====================================================

// Universal Router ABI (minimal)
const UNIVERSAL_ROUTER_ABI = [
    'function execute(bytes commands, bytes[] inputs, uint256 deadline) external payable'
];

// Permit2 ABI (minimal)
const PERMIT2_ABI = [
    'function allowance(address user, address token, address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)'
];

// Infinity BinPoolManager ABI (minimal)
const BIN_POOL_MANAGER_ABI = [
    'function getSlot0(bytes32 id) external view returns (uint24 activeId, uint24 protocolFee, uint24 lpFee)'
];

// Infinity BinQuoter ABI (minimal)
const BIN_QUOTER_ABI = [
    {
        type: 'function',
        name: 'quoteExactInputSingle',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    {
                        name: 'poolKey',
                        type: 'tuple',
                        components: [
                            { name: 'currency0', type: 'address' },
                            { name: 'currency1', type: 'address' },
                            { name: 'hooks', type: 'address' },
                            { name: 'poolManager', type: 'address' },
                            { name: 'fee', type: 'uint24' },
                            { name: 'parameters', type: 'bytes32' }
                        ]
                    },
                    { name: 'zeroForOne', type: 'bool' },
                    { name: 'exactAmount', type: 'uint128' },
                    { name: 'hookData', type: 'bytes' }
                ]
            }
        ],
        outputs: [
            { name: 'amountOut', type: 'uint256' },
            { name: 'gasEstimate', type: 'uint256' }
        ]
    }
];

// ERC20 ABI (minimal)
const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)'
];

// Universal Router command ids
const COMMANDS = {
    PERMIT2_PERMIT: 0x0a,
    INFI_SWAP: 0x10
};

// Infinity action ids
const ACTIONS = {
    SETTLE_ALL: 0x0c,
    TAKE_ALL: 0x0f,
    BIN_SWAP_EXACT_IN_SINGLE: 0x1c
};

class SwapManager {
    constructor() {
        this.slippage = 0.5; // 0.5%
        this.deadline = 20; // 20 minutes

        this.fromToken = 'USDT';
        this.toToken = 'UUSD';
        this.fromAmount = '';
        this.toAmount = '';
        this.priceImpact = 0;
        this.route = []; // legacy field (Infinity swap doesn't use V2 path arrays)

        this.isLoading = false;
        this.quoteTimeout = null;

        // Infinity LBAMM pool cache
        this.poolId = CONTRACTS.UUSD_LB_POOL_ID;
        this.poolKey = null;   // {currency0,currency1,hooks,poolManager,fee,parameters}
        this.poolMeta = null;  // {binStep, lpFee, activeId, protocolFee}
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
        }

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

        if (logoEl && token.logo) {
            logoEl.src = token.logo;
            logoEl.style.display = 'block';
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

            // Only support swaps against the UUSD/USDT LBAMM pool for now
            if (!this.isSupportedPair()) {
                throw new Error('Only USDT <-> UUSD is supported on this page currently.');
            }

            const provider = wallet.provider || new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
            await this.resolveInfinityPool(provider);

            const fromToken = TOKENS[this.fromToken];
            const toToken = TOKENS[this.toToken];

            const amountIn = this.parseUnitsSafe(this.fromAmount, fromToken.decimals);

            const binQuoter = new ethers.Contract(CONTRACTS.INFI_BIN_QUOTER, BIN_QUOTER_ABI, provider);
            const zeroForOne = this.isZeroForOne(fromToken.address);

            // NOTE: BinQuoter functions are nonpayable (not "view") but are intended to be called via eth_call.
            // In ethers v6, calling a non-view function defaults to sending a transaction unless we use staticCall().
            const quoteFn = binQuoter.getFunction('quoteExactInputSingle');
            const [amountOut] = await quoteFn.staticCall({
                poolKey: this.poolKey,
                zeroForOne,
                exactAmount: this.toUint128(amountIn),
                hookData: '0x'
            });

            const amountOutFormatted = ethers.formatUnits(amountOut, toToken.decimals);

            this.toAmount = amountOutFormatted;
            this.route = [];

            toAmountInput.value = parseFloat(amountOutFormatted).toFixed(6);

            // Calculate rate (simple)
            const rate = parseFloat(amountOutFormatted) / parseFloat(this.fromAmount);
            this.priceImpact = 0;

            // Update swap details
            if (swapDetails) {
                swapDetails.style.display = 'block';
                document.getElementById('swap-rate').textContent =
                    `1 ${this.fromToken} = ${rate.toFixed(6)} ${this.toToken}`;
                document.getElementById('min-received').textContent =
                    `${(parseFloat(amountOutFormatted) * (1 - this.slippage / 100)).toFixed(6)} ${this.toToken}`;
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
        // Swap from and to tokens
        const temp = this.fromToken;
        this.fromToken = this.toToken;
        this.toToken = temp;

        // Clear amounts when swapping direction
        this.fromAmount = '';
        this.toAmount = '';

        document.getElementById('from-amount').value = '';
        document.getElementById('to-amount').value = '';
        document.getElementById('swap-details').style.display = 'none';

        this.updateTokenDisplay('from', this.fromToken);
        this.updateTokenDisplay('to', this.toToken);
        this.updateBalances();
        this.updateSwapButton();
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

    // Allowed trading pairs (current implementation): UUSD <-> USDT (LBAMM pool)
    getAvailableTokens(side) {
        const otherSide = side === 'from' ? this.toToken : this.fromToken;

        if (otherSide === 'UUSD') return ['USDT'];
        if (otherSide === 'USDT') return ['UUSD'];
        return side === 'from' ? ['USDT'] : ['UUSD'];
    }

    openTokenModal(side) {
        this.selectingSide = side;
        const modal = document.getElementById('token-modal');
        const tokenList = document.getElementById('token-list');

        if (!modal || !tokenList) return;

        // Get available tokens for this side
        const availableTokens = this.getAvailableTokens(side);

        // Populate token list
        tokenList.innerHTML = availableTokens.map(tokenKey => {
            const token = TOKENS[tokenKey];
            const logoSrc = token.logo || 'assets/logo.png';
            return `
                <div class="token-list-item" data-token="${tokenKey}">
                    <img src="${logoSrc}" alt="${token.symbol}">
                    <div class="token-list-info">
                        <div class="token-list-name">${token.symbol}</div>
                        <div class="token-list-fullname">${token.name}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Re-bind click events
        tokenList.querySelectorAll('.token-list-item').forEach(item => {
            item.addEventListener('click', (e) => this.selectToken(e.currentTarget.dataset.token));
        });

        modal.classList.add('active');
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
            this.fromToken = tokenKey;
            // Ensure the other side is valid
            if (tokenKey === 'UUSD') this.toToken = 'USDT';
            if (tokenKey === 'USDT') this.toToken = 'UUSD';
        } else {
            this.toToken = tokenKey;
            // Ensure the other side is valid
            if (tokenKey === 'UUSD') this.fromToken = 'USDT';
            if (tokenKey === 'USDT') this.fromToken = 'UUSD';
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

        if (!this.fromAmount || !this.toAmount) {
            return;
        }

        try {
            swapBtn.disabled = true;
            swapBtn.innerHTML = '<span class="spinner"></span> Processing...';

            if (!this.isSupportedPair()) {
                throw new Error('Only USDT <-> UUSD is supported on this page currently.');
            }

            const provider = wallet.provider;
            await this.resolveInfinityPool(provider);

            const fromToken = TOKENS[this.fromToken];
            const toToken = TOKENS[this.toToken];

            const amountIn = this.parseUnitsSafe(this.fromAmount, fromToken.decimals);
            const quotedOut = this.parseUnitsSafe(this.toAmount, toToken.decimals);
            const amountOutMin = this.applySlippage(quotedOut, this.slippage);

            const deadline = Math.floor(Date.now() / 1000) + (this.deadline * 60);

            // 1) Ensure ERC20 approval to Permit2 (one-time per token)
            showTxStatus('pending', 'Approving token for Permit2 (if needed)...');
            await this.ensurePermit2TokenApproval(fromToken.address, amountIn);

            // 2) Build Permit2 permit signature for Universal Router
            showTxStatus('pending', 'Signing Permit2 message...');
            const permit2 = new ethers.Contract(CONTRACTS.PERMIT2, PERMIT2_ABI, provider);
            const permitState = await permit2.allowance(wallet.address, fromToken.address, CONTRACTS.INFINITY_UNIVERSAL_ROUTER);
            const nonce = permitState.nonce;

            const expiration = this.toUint48(deadline); // short lived
            const sigDeadline = BigInt(deadline);

            const permitSingle = {
                details: {
                    token: fromToken.address,
                    amount: this.toUint160(amountIn),
                    expiration,
                    nonce
                },
                spender: CONTRACTS.INFINITY_UNIVERSAL_ROUTER,
                sigDeadline
            };

            const domain = {
                name: 'Permit2',
                chainId: 56, // BSC mainnet
                verifyingContract: CONTRACTS.PERMIT2
            };
            const types = {
                PermitDetails: [
                    { name: 'token', type: 'address' },
                    { name: 'amount', type: 'uint160' },
                    { name: 'expiration', type: 'uint48' },
                    { name: 'nonce', type: 'uint48' }
                ],
                PermitSingle: [
                    { name: 'details', type: 'PermitDetails' },
                    { name: 'spender', type: 'address' },
                    { name: 'sigDeadline', type: 'uint256' }
                ]
            };

            const signature = await wallet.signer.signTypedData(domain, types, permitSingle);

            const abi = ethers.AbiCoder.defaultAbiCoder();
            const permitInput = abi.encode(
                [
                    'tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)',
                    'bytes'
                ],
                [permitSingle, signature]
            );

            // 3) Build INFI_SWAP payload (BIN_SWAP_EXACT_IN_SINGLE + SETTLE_ALL + TAKE_ALL)
            const swapForY = this.isZeroForOne(fromToken.address);
            const inputCurrency = swapForY ? this.poolKey.currency0 : this.poolKey.currency1;
            const outputCurrency = swapForY ? this.poolKey.currency1 : this.poolKey.currency0;

            const swapActionParam = abi.encode(
                [
                    'tuple(tuple(address currency0,address currency1,address hooks,address poolManager,uint24 fee,bytes32 parameters) poolKey,bool swapForY,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)'
                ],
                [{
                    poolKey: this.poolKey,
                    swapForY,
                    amountIn: this.toUint128(amountIn),
                    amountOutMinimum: this.toUint128(amountOutMin),
                    hookData: '0x'
                }]
            );

            const settleAllParam = abi.encode(['address', 'uint256'], [inputCurrency, ethers.MaxUint256]);
            const takeAllParam = abi.encode(['address', 'uint256'], [outputCurrency, 0n]);

            const actionsBytes = ethers.concat([
                ethers.toBeHex(ACTIONS.BIN_SWAP_EXACT_IN_SINGLE, 1),
                ethers.toBeHex(ACTIONS.SETTLE_ALL, 1),
                ethers.toBeHex(ACTIONS.TAKE_ALL, 1)
            ]);

            const infiPayload = abi.encode(['bytes', 'bytes[]'], [actionsBytes, [swapActionParam, settleAllParam, takeAllParam]]);

            // 4) Execute via Infinity Universal Router
            const commands = ethers.concat([
                ethers.toBeHex(COMMANDS.PERMIT2_PERMIT, 1),
                ethers.toBeHex(COMMANDS.INFI_SWAP, 1)
            ]);

            const universalRouter = new ethers.Contract(CONTRACTS.INFINITY_UNIVERSAL_ROUTER, UNIVERSAL_ROUTER_ABI, wallet.signer);

            showTxStatus('pending', 'Waiting for confirmation...');
            const tx = await universalRouter.execute(commands, [permitInput, infiPayload], deadline);

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
            showTxStatus('error', getShortErrorMessage(error));
        } finally {
            this.updateSwapButton();
        }
    }

    // =====================================================
    // Infinity helpers
    // =====================================================

    isSupportedPair() {
        return (
            (this.fromToken === 'USDT' && this.toToken === 'UUSD') ||
            (this.fromToken === 'UUSD' && this.toToken === 'USDT')
        );
    }

    isZeroForOne(fromTokenAddress) {
        if (!this.poolKey) return false;
        return fromTokenAddress.toLowerCase() === this.poolKey.currency0.toLowerCase();
    }

    async resolveInfinityPool(provider) {
        if (this.poolKey && this.poolMeta) return;

        const hooks = ethers.ZeroAddress;
        const poolManager = CONTRACTS.INFI_BIN_POOL_MANAGER;

        const tokenA = TOKENS.USDT.address;
        const tokenB = TOKENS.UUSD.address;
        const [currency0, currency1] = this.sortAddresses(tokenA, tokenB);

        const binPoolManager = new ethers.Contract(CONTRACTS.INFI_BIN_POOL_MANAGER, BIN_POOL_MANAGER_ABI, provider);
        const [activeId, protocolFee, lpFee] = await binPoolManager.getSlot0(this.poolId);

        const fee = BigInt(lpFee);
        const recovered = this.recoverBinStepAndParameters(this.poolId, {
            currency0,
            currency1,
            hooks,
            poolManager,
            fee
        });

        if (!recovered) {
            throw new Error('Failed to resolve LBAMM pool parameters (binStep). Please verify poolId / token pair.');
        }

        // Note: ethers will properly encode uint24 from a JS number; lpFee fits in uint24.
        this.poolKey = {
            currency0,
            currency1,
            hooks,
            poolManager,
            fee: Number(fee),
            parameters: recovered.parameters
        };

        this.poolMeta = {
            binStep: recovered.binStep,
            activeId,
            protocolFee,
            lpFee
        };
    }

    recoverBinStepAndParameters(poolId, { currency0, currency1, hooks, poolManager, fee }) {
        const abi = ethers.AbiCoder.defaultAbiCoder();
        for (let binStep = 1; binStep <= 100; binStep++) {
            // BinPoolParametersHelper: binStep stored at bit offset 16
            const parameters = ethers.toBeHex(BigInt(binStep) << 16n, 32);
            const encoded = abi.encode(
                ['address', 'address', 'address', 'address', 'uint24', 'bytes32'],
                [currency0, currency1, hooks, poolManager, fee, parameters]
            );
            const candidateId = ethers.keccak256(encoded);
            if (candidateId.toLowerCase() === poolId.toLowerCase()) {
                return { binStep, parameters };
            }
        }
        return null;
    }

    sortAddresses(a, b) {
        const aa = BigInt(a.toLowerCase());
        const bb = BigInt(b.toLowerCase());
        return aa < bb ? [a, b] : [b, a];
    }

    parseUnitsSafe(amountStr, decimals) {
        const trimmed = (amountStr ?? '').toString().trim();
        if (!trimmed) return 0n;
        return ethers.parseUnits(trimmed, decimals);
    }

    applySlippage(amountOut, slippagePct) {
        // slippagePct is percent (e.g. 0.5 => 0.5%)
        const bps = BigInt(Math.round(Number(slippagePct) * 100)); // 0.01% resolution
        const denom = 10000n;
        const factor = denom - bps;
        return (amountOut * factor) / denom;
    }

    toUint48(v) {
        const x = BigInt(v);
        if (x < 0n || x > (1n << 48n) - 1n) throw new Error('uint48 overflow');
        return x;
    }

    toUint160(v) {
        const x = BigInt(v);
        if (x < 0n || x > (1n << 160n) - 1n) throw new Error('uint160 overflow');
        return x;
    }

    toUint128(v) {
        const x = BigInt(v);
        if (x < 0n || x > (1n << 128n) - 1n) throw new Error('uint128 overflow');
        return x;
    }

    async ensurePermit2TokenApproval(tokenAddress, amount) {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet.signer);
        const allowance = await token.allowance(wallet.address, CONTRACTS.PERMIT2);
        if (allowance >= amount) return;
        const tx = await token.approve(CONTRACTS.PERMIT2, ethers.MaxUint256);
        await tx.wait();
    }
}

// Helper function to show transaction status
function showTxStatus(status, message) {
    const txStatus = document.getElementById('tx-status');
    if (!txStatus) return;

    txStatus.className = `tx-status ${status}`;
    // For error/pending, avoid dumping large payloads / HTML; keep it plain text.
    // Success messages may include a link.
    if (status === 'success') {
        txStatus.innerHTML = message;
    } else {
        txStatus.textContent = message;
    }
    txStatus.style.display = 'block';

    if (status === 'success' || status === 'error') {
        // Auto-hide after 10 seconds
        setTimeout(() => {
            txStatus.style.display = 'none';
        }, 10000);
    }
}

// Extract the most relevant message from ethers/MetaMask errors.
function getShortErrorMessage(error) {
    // Standard user rejection codes
    if (error?.code === 'ACTION_REJECTED' || error?.code === 4001) {
        return '用户拒绝了请求';
    }

    const candidates = [
        error?.info?.error?.message,
        error?.error?.message,
        error?.data?.message,
        error?.reason,
        error?.shortMessage,
        error?.message
    ];

    let msg = candidates.find((m) => typeof m === 'string' && m.trim());
    if (!msg) return '交易失败';

    msg = msg.trim();

    // If we only got the outer "could not coalesce error" string, try to pull inner message.
    // Example: could not coalesce error (error={ "code": -32603, "message": "user reject this request" }, ...)
    if (msg.toLowerCase().includes('could not coalesce error')) {
        const match = msg.match(/"message"\s*:\s*"([^"]+)"/i);
        if (match?.[1]) msg = match[1];
    }

    msg = msg.replace(/^execution reverted:\s*/i, '').trim();

    const lower = msg.toLowerCase();
    if (lower.includes('user reject') || lower.includes('user rejected')) return '用户拒绝了请求';
    if (lower.includes('insufficient funds')) return '余额不足以支付 Gas';
    if (lower.includes('nonce too low')) return 'Nonce 太低（请稍后重试）';

    // Keep it short for UI
    if (msg.length > 140) msg = msg.slice(0, 140);
    return msg;
}

// Create global swap manager instance
window.swapManager = new SwapManager();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.swapManager.init();
});
