/**
 * CALCSHOP - Core Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // ---- STATE MANAGEMENT ----
    let cart = JSON.parse(localStorage.getItem('calcshop-cart')) || [];
    let isTaxEnabled = localStorage.getItem('calcshop-tax') === 'true';
    let seqCount = parseInt(localStorage.getItem('calcshop-seq')) || 1;
    let taxRateStr = localStorage.getItem('calcshop-tax-rate');
    let taxRate = taxRateStr !== null ? parseInt(taxRateStr, 10) : 12; // default 12%
    
    let activeInput = document.getElementById('std-base'); 
    let currentCalcState = { type: 'standard', finalPrice: 0, subText: '' };

    // Set initial tax state
    const taxSwitch = document.getElementById('tax-switch');
    taxSwitch.checked = isTaxEnabled;
    const taxRateInput = document.getElementById('tax-rate-input');
    taxRateInput.dataset.raw = taxRate;
    taxRateInput.innerText = taxRate;

    // Load budget
    const budgetRaw = localStorage.getItem('calcshop-budget') || '0';
    const budgetInput = document.getElementById('budget-input');
    budgetInput.dataset.raw = budgetRaw;
    budgetInput.innerText = budgetRaw !== '0' ? parseInt(budgetRaw, 10).toLocaleString('id-ID') : '0';

    // ---- INIT UI ----
    bindEvents();
    renderCart();
    updateBudgetAndCartDisplay();
    calculateCurrent();

    // ---- EVENTS BINDING ----
    function bindEvents() {
        // Tab Switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                const target = e.target.dataset.target;
                e.target.classList.add('active');
                document.getElementById(`tab-${target}`).classList.add('active');
                
                // Focus the first input of the newly selected tab
                const firstInput = document.querySelector(`#tab-${target} .custom-input`);
                setActiveInput(firstInput);
                calculateCurrent();
            });
        });

        // Numpad Keys
        document.querySelectorAll('.key').forEach(key => {
            key.addEventListener('click', () => {
                handleNumpadInput(key.dataset.action);
            });
        });
        
        // Prevent default touch behaviors where possible
        document.querySelectorAll('.key, .custom-input, .btn-primary').forEach(el => {
            el.addEventListener('touchstart', (e) => {}, {passive: true});
        });

        // Custom Inputs Focus
        document.querySelectorAll('.custom-input').forEach(input => {
            input.addEventListener('click', () => setActiveInput(input));
        });

        // Tax Toggle
        taxSwitch.addEventListener('change', (e) => {
            isTaxEnabled = e.target.checked;
            localStorage.setItem('calcshop-tax', isTaxEnabled);
            calculateCurrent();
            updateBudgetAndCartDisplay();
        });

        // Add to Cart btn
        document.getElementById('add-to-cart-btn').addEventListener('click', addToCart);

        // Info Modal control
        const infoBtn = document.getElementById('info-btn');
        const infoModal = document.getElementById('info-modal');
        const closeModalBtn = document.getElementById('close-modal-btn');

        if (infoBtn && infoModal && closeModalBtn) {
            infoBtn.addEventListener('click', () => {
                infoModal.classList.add('active');
            });

            closeModalBtn.addEventListener('click', () => {
                infoModal.classList.remove('active');
            });

            // Close when clicking overlay
            infoModal.addEventListener('click', (e) => {
                if (e.target === infoModal) {
                    infoModal.classList.remove('active');
                }
            });
        }

    }

    // ---- INPUT LOGIC ----
    function setActiveInput(inputEl) {
        if (!inputEl) return;
        document.querySelectorAll('.custom-input').forEach(el => el.classList.remove('active-input'));
        inputEl.classList.add('active-input');
        activeInput = inputEl;
    }

    function handleNumpadInput(action) {
        if (!activeInput) return;

        let currentRaw = activeInput.dataset.raw || '0';

        if (action === 'clear') {
            currentRaw = '0';
        } else if (action === 'backspace') {
            currentRaw = currentRaw.slice(0, -1) || '0';
        } else if (action === '000') {
            if (currentRaw !== '0') {
                currentRaw += '000';
            }
        } else if (action === 'next') {
            // Find next input sequentially
            const inputs = Array.from(document.querySelectorAll('.app-header .custom-input, .tab-content.active .custom-input, .budget-header .custom-input'));
            const index = inputs.indexOf(activeInput);
            if (index > -1) {
                const nextInput = inputs[(index + 1) % inputs.length];
                setActiveInput(nextInput);
            }
            return;
        } else {
            // Processing digits 0-9
            if (currentRaw === '0') {
                currentRaw = action;
            } else {
                currentRaw += action;
            }
        }

        // Apply max length constraints
        const max = parseInt(activeInput.dataset.max) || 15;
        if (currentRaw.length > max) {
            currentRaw = currentRaw.slice(0, max);
        }

        activeInput.dataset.raw = currentRaw;
        
        // Format strings
        if (activeInput.classList.contains('currency')) {
            activeInput.innerText = currentRaw !== '0' ? parseInt(currentRaw, 10).toLocaleString('id-ID') : '0';
        } else {
            activeInput.innerText = currentRaw;
        }
        
        // Auto-save budget if it's budget input
        if (activeInput.id === 'budget-input') {
            localStorage.setItem('calcshop-budget', currentRaw);
            updateBudgetAndCartDisplay();
        } else if (activeInput.id === 'tax-rate-input') {
            taxRate = parseInt(currentRaw || '0', 10);
            localStorage.setItem('calcshop-tax-rate', taxRate);
            calculateCurrent();
            updateBudgetAndCartDisplay();
        } else {
            calculateCurrent();
        }
    }

    // ---- MATH LOGIC ----
    function calculateCurrent() {
        const tab = document.querySelector('.tab.active').dataset.target;
        let finalPrice = 0;
        let subText = '';
        
        const taxMultiplier = isTaxEnabled ? (1 + (taxRate / 100)) : 1.0;

        /**
         * Discount Logic Math:
         * Standard Discount: Final Price = Base - (Base * Discount / 100)
         * Tiered Discount (A + B): Apply Disc1 to Base -> Price1. Apply Disc2 to Price1 -> Final.
         * BOGO: User pays for 'Paid' qty but gets 'Get' qty. Cost = Item * Paid.
         */

        if (tab === 'standard') {
            const base = parseInt(document.getElementById('std-base').dataset.raw || '0', 10);
            const disc = parseInt(document.getElementById('std-disc').dataset.raw || '0', 10);
            
            const discountAmt = base * (disc / 100);
            finalPrice = base - discountAmt;
            
            if (disc > 0 && base > 0) {
                subText = `Hemat Rp ${Math.round(discountAmt * taxMultiplier).toLocaleString('id-ID')}`;
            }
        } else if (tab === 'tiered') {
            const base = parseInt(document.getElementById('trd-base').dataset.raw || '0', 10);
            const disc1 = parseInt(document.getElementById('trd-disc1').dataset.raw || '0', 10);
            const disc2 = parseInt(document.getElementById('trd-disc2').dataset.raw || '0', 10);
            
            const price1 = base - (base * (disc1 / 100));
            const finalNoTax = price1 - (price1 * (disc2 / 100));
            finalPrice = finalNoTax;
            
            const totalSaved = base - finalNoTax;
            if (totalSaved > 0 && base > 0) {
                subText = `Hemat Rp ${Math.round(totalSaved * taxMultiplier).toLocaleString('id-ID')}`;
            }
        } else if (tab === 'bogo') {
            const price = parseInt(document.getElementById('bgo-price').dataset.raw || '0', 10);
            const paid = parseInt(document.getElementById('bgo-paid').dataset.raw || '0', 10);
            const recv = parseInt(document.getElementById('bgo-recv').dataset.raw || '0', 10);
            
            finalPrice = price * paid; 
            if (recv > 0 && finalPrice > 0) {
                const effective = finalPrice / recv;
                subText = `Jatuhnya: Rp ${Math.round(effective * taxMultiplier).toLocaleString('id-ID')} / barang`;
            }
        }

        // Output formatting
        const displayedFinal = finalPrice * taxMultiplier;

        document.getElementById('result-price').innerText = `Rp ${Math.round(displayedFinal).toLocaleString('id-ID')}`;
        document.getElementById('result-subtext').innerText = subText;
        
        currentCalcState = {
            type: tab,
            finalPrice: finalPrice, 
            subText: subText
        };
    }

    // ---- CART & BUDGET TRACKING ----
    function addToCart() {
        if (!currentCalcState || currentCalcState.finalPrice <= 0) return;
        
        let typeName = 'Barang';
        if (currentCalcState.type === 'standard') typeName = 'Standar';
        if (currentCalcState.type === 'tiered') typeName = 'Bertingkat';
        if (currentCalcState.type === 'bogo') typeName = 'BOGO';

        const name = `Barang ${seqCount}`;
        
        cart.push({
            id: Date.now(),
            name: name,
            type: currentCalcState.type,
            baseFinalPrice: currentCalcState.finalPrice
        });
        
        seqCount++;
        localStorage.setItem('calcshop-seq', seqCount);
        localStorage.setItem('calcshop-cart', JSON.stringify(cart));
        
        // Reset current active form inputs nicely to '0'
        document.querySelectorAll('.tab-content.active .custom-input').forEach(input => {
            input.dataset.raw = '0';
            if(input.classList.contains('currency')) input.innerText = '0';
            else input.innerText = '0';
        });
        calculateCurrent();
        renderCart();
        updateBudgetAndCartDisplay();
    }

    function renderCart() {
        const list = document.getElementById('cart-list');
        const count = document.getElementById('cart-count');
        
        count.innerText = `${cart.length} barang`;
        list.innerHTML = '';

        if (cart.length === 0) {
            list.innerHTML = `<li class="cart-empty">Keranjang belanja kosong</li>`;
            return;
        }

        const taxMultiplier = isTaxEnabled ? (1 + (taxRate / 100)) : 1.0;

        cart.forEach((item) => {
            const displayPrice = Math.round(item.baseFinalPrice * taxMultiplier);
            
            const li = document.createElement('li');
            li.className = 'cart-item';
            li.innerHTML = `
              <div class="cart-item-info">
                <span class="cart-item-name">${item.name}</span>
                <span class="cart-item-desc">${item.type.charAt(0).toUpperCase() + item.type.slice(1)}</span>
              </div>
              <div class="cart-item-right">
                <div class="cart-item-price">Rp ${displayPrice.toLocaleString('id-ID')}</div>
                <button class="cart-item-delete" data-id="${item.id}">×</button>
              </div>
            `;
            list.appendChild(li);
        });

        // Delete handlers
        document.querySelectorAll('.cart-item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.target.dataset.id, 10);
                cart = cart.filter(i => i.id !== id);
                localStorage.setItem('calcshop-cart', JSON.stringify(cart));
                renderCart();
                updateBudgetAndCartDisplay();
            });
        });
    }

    function updateBudgetAndCartDisplay() {
        const taxMultiplier = isTaxEnabled ? (1 + (taxRate / 100)) : 1.0;
        
        let grandTotal = 0;
        cart.forEach(item => {
            grandTotal += item.baseFinalPrice * taxMultiplier;
        });

        document.getElementById('grand-total-val').innerText = `Rp ${Math.round(grandTotal).toLocaleString('id-ID')}`;

        const budgetRaw = document.getElementById('budget-input').dataset.raw || '0';
        const budget = parseInt(budgetRaw, 10);
        
        const fillEl = document.getElementById('budget-fill');
        
        if (budget > 0) {
            let percent = (grandTotal / budget) * 100;
            if (percent > 100) percent = 100;
            fillEl.style.width = percent + '%';
            
            fillEl.classList.remove('safe', 'warning', 'danger');
            
            if (grandTotal > budget) {
                fillEl.classList.add('danger');
            } else if (grandTotal >= budget * 0.8) {
                fillEl.classList.add('warning');
            } else {
                fillEl.classList.add('safe');
            }
        } else {
            fillEl.style.width = '0%';
            fillEl.classList.remove('safe', 'warning', 'danger');
        }
    }
    
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(() => console.log('SW Registered'))
                .catch(e => console.error('SW Error', e));
        });
    }
});
