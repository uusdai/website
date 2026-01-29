// =====================================================
// UUSD Website - Main Application
// =====================================================

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    // Initialize animations
    if (typeof initAnimations === 'function') {
        initAnimations();
    }

    // Initialize copy functionality
    initCopyButtons();

    // Initialize Add to MetaMask
    initAddToMetaMask();

    // Initialize mobile menu
    initMobileMenu();

    // Header style is now fixed, no scroll effect needed

    // Initialize wallet UI updates
    updateWalletUI();
});

// Copy to clipboard functionality
function initCopyButtons() {
    const copyBtn = document.querySelector('.copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const address = document.querySelector('.contract-address').textContent;
            try {
                await navigator.clipboard.writeText(address);
                showToast('Address copied to clipboard!');
            } catch (err) {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = address;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('Address copied to clipboard!');
            }
        });
    }
}

// Add UUSD to MetaMask
function initAddToMetaMask() {
    const addBtn = document.getElementById('add-to-metamask');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            if (!window.ethereum) {
                showToast('Please install MetaMask first');
                return;
            }

            try {
                await window.ethereum.request({
                    method: 'wallet_watchAsset',
                    params: {
                        type: 'ERC20',
                        options: {
                            address: CONTRACTS.UUSD,
                            symbol: 'UUSD',
                            decimals: 18,
                            image: '' // Can add logo URL later
                        }
                    }
                });
                showToast('UUSD added to MetaMask!');
            } catch (error) {
                if (error.code !== 4001) {
                    showToast('Failed to add token');
                }
            }
        });
    }
}

// Mobile menu toggle
function initMobileMenu() {
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('mobile-active');
            menuToggle.classList.toggle('active');
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('mobile-active');
                menuToggle.classList.remove('active');
            });
        });
    }
}

// Header scroll effect
function initHeaderScroll() {
    const header = document.querySelector('header');
    if (!header) return;

    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 100) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        lastScroll = currentScroll;
    });
}

// Update wallet UI
function updateWalletUI() {
    if (typeof wallet !== 'undefined') {
        wallet.on('connect', (address) => {
            updateConnectedState(address);
        });

        wallet.on('disconnect', () => {
            updateDisconnectedState();
        });
    }
}

function updateConnectedState(address) {
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

    // Update header wallet button if exists
    const headerWalletBtn = document.querySelector('.nav-cta .btn-primary');
    if (headerWalletBtn) {
        headerWalletBtn.textContent = shortAddress;
        headerWalletBtn.classList.add('connected');
    }
}

function updateDisconnectedState() {
    const headerWalletBtn = document.querySelector('.nav-cta .btn-primary');
    if (headerWalletBtn) {
        headerWalletBtn.textContent = 'Get UUSD';
        headerWalletBtn.classList.remove('connected');
    }
}

// Toast notification
function showToast(message, duration = 3000) {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #00f5ff 0%, #b14aed 100%);
        color: #0a0a0f;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        z-index: 9999;
        animation: toastIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    // Remove after duration
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Add toast animations to document
const toastStyles = document.createElement('style');
toastStyles.textContent = `
    @keyframes toastIn {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    @keyframes toastOut {
        from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        to {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
    }

    /* Mobile nav styles */
    @media (max-width: 768px) {
        .nav-links.mobile-active {
            display: flex !important;
            flex-direction: column;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: rgba(10, 10, 15, 0.98);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            padding: 24px;
            gap: 16px;
        }

        .menu-toggle.active span:nth-child(1) {
            transform: rotate(45deg) translate(5px, 5px);
        }

        .menu-toggle.active span:nth-child(2) {
            opacity: 0;
        }

        .menu-toggle.active span:nth-child(3) {
            transform: rotate(-45deg) translate(5px, -5px);
        }
    }

`;
document.head.appendChild(toastStyles);

// Utility: Format address
function formatAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Utility: Format number
function formatNumber(num, decimals = 2) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(decimals) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(decimals) + 'K';
    }
    return num.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

// Export utilities
window.showToast = showToast;
window.formatAddress = formatAddress;
window.formatNumber = formatNumber;
