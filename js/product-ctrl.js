/**
 * @file product-ctrl.js
 * @brief ProtoView 协议管理库、产品设备中心与归类控制器
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};
    ProtoView.Controllers = ProtoView.Controllers || {};

    const escapeHTML = ProtoView.escapeHTML || global.escapeHTML || function(s){ return s || ''; };
    const showToast = ProtoView.showToast || global.showToast || function(){};
    const downloadFile = ProtoView.downloadFile || global.downloadFile || function(){};

    // 状态
    let activeProductFilter = 'all';
    let productSearchQuery = '';
    let collapsedProducts = new Set();
    try {
        const savedCollapsed = localStorage.getItem('protoview_collapsed_products');
        if (savedCollapsed) {
            collapsedProducts = new Set(JSON.parse(savedCollapsed));
        }
    } catch (e) {
        collapsedProducts = new Set();
    }

    // DOM 元素
    let protocolList, btnCreateProtocol;
    let btnCreateProduct, productManageModal, productManageForm, productModalTitle,
        productManageOriginalName, productManageName, productManageCode, productManageDesc,
        btnAddProductCsci, productCsciList,
        productDatalist, productTabsContainer, productProtoSearch, btnClearProductSearch;

    let btnToggleCollapseAll, iconCollapseAll, btnCollapseAllText;

    // 统一协议配置弹窗 DOM 引用
    let protocolConfigModal, protocolConfigForm, protoModalTitle,
        protoFormId, protoFormMode, protoFormLockedType,
        protoFormName, protoFormProduct, protoFormType, protoTypeLockBadge,
        protoFormDevice, protoFormDirection, protoFormPeriod, protoFormPeriodHint,
        protoArincSubtype, protoArincSubtypeLockBadge, protoArincSpeed, protoArincParity, protoArincMode, protoArincModeLockBadge,
        protoSerialSubtype, protoSerialSubtypeLockBadge, protoSerialBaud, protoSerialDataBits, protoSerialParity, protoSerialStopBits,
        protoCanStandard, protoCanStandardLockBadge, protoCanBaud,
        protoFormDesc, protoFormSummaryBox, protoSummaryCountLabel, protoSummaryCountVal, protoSummaryIdVal,
        btnProtoFormSubmit, btnProtoSubmitText;

    function initDOMElements() {
        protocolList = document.getElementById('protocol-list');
        btnCreateProtocol = document.getElementById('btn-create-protocol');

        btnCreateProduct = document.getElementById('btn-create-product');
        productManageModal = document.getElementById('product-manage-modal');
        productManageForm = document.getElementById('product-manage-form');
        productModalTitle = document.getElementById('product-modal-title');
        productManageOriginalName = document.getElementById('product-manage-original-name');
        productManageName = document.getElementById('product-manage-name');
        productManageCode = document.getElementById('product-manage-code');
        productManageDesc = document.getElementById('product-manage-desc');
        btnAddProductCsci = document.getElementById('btn-add-product-csci');
        productCsciList = document.getElementById('product-csci-list');
        productDatalist = document.getElementById('product-datalist');
        productTabsContainer = document.getElementById('product-tabs-container');
        productProtoSearch = document.getElementById('product-proto-search');
        btnClearProductSearch = document.getElementById('btn-clear-product-search');

        btnToggleCollapseAll = document.getElementById('btn-toggle-collapse-all');
        iconCollapseAll = document.getElementById('icon-collapse-all');
        btnCollapseAllText = document.getElementById('btn-collapse-all-text');

        // 统一协议配置弹窗
        protocolConfigModal = document.getElementById('protocol-config-modal');
        protocolConfigForm = document.getElementById('protocol-config-form');
        protoModalTitle = document.getElementById('proto-modal-title');
        protoFormId = document.getElementById('proto-form-id');
        protoFormMode = document.getElementById('proto-form-mode');
        protoFormLockedType = document.getElementById('proto-form-locked-type');

        protoFormName = document.getElementById('proto-form-name');
        protoFormProduct = document.getElementById('proto-form-product');
        protoFormType = document.getElementById('proto-form-type');
        protoTypeLockBadge = document.getElementById('proto-type-lock-badge');

        protoFormDevice = document.getElementById('proto-form-device');
        protoFormPeriod = document.getElementById('proto-form-period');
        protoFormPeriodHint = document.getElementById('proto-form-period-hint');

        protoArincSubtype = document.getElementById('proto-arinc-subtype');
        protoArincSubtypeLockBadge = document.getElementById('proto-arinc-subtype-lock-badge');
        protoArincSpeed = document.getElementById('proto-arinc-speed');
        protoArincParity = document.getElementById('proto-arinc-parity');
        protoArincMode = document.getElementById('proto-arinc-mode');
        protoArincModeLockBadge = document.getElementById('proto-arinc-mode-lock-badge');

        protoSerialSubtype = document.getElementById('proto-serial-subtype');
        protoSerialSubtypeLockBadge = document.getElementById('proto-serial-subtype-lock-badge');
        protoSerialBaud = document.getElementById('proto-serial-baud');
        protoSerialDataBits = document.getElementById('proto-serial-databits');
        protoSerialParity = document.getElementById('proto-serial-parity');
        protoSerialStopBits = document.getElementById('proto-serial-stopbits');

        protoCanStandard = document.getElementById('proto-can-standard');
        protoCanStandardLockBadge = document.getElementById('proto-can-standard-lock-badge');
        protoCanBaud = document.getElementById('proto-can-baud');

        protoFormDesc = document.getElementById('proto-form-desc');
        protoFormSummaryBox = document.getElementById('proto-form-summary-box');
        protoSummaryCountLabel = document.getElementById('proto-summary-count-label');
        protoSummaryCountVal = document.getElementById('proto-summary-count-val');
        protoSummaryIdVal = document.getElementById('proto-summary-id-val');

        btnProtoFormSubmit = document.getElementById('btn-proto-form-submit');
        btnProtoSubmitText = document.getElementById('btn-proto-submit-text');
    }

    function saveCollapsedProductsState() {
        try {
            localStorage.setItem('protoview_collapsed_products', JSON.stringify(Array.from(collapsedProducts)));
        } catch (e) {
            console.warn("保存产品折叠状态失败:", e);
        }
    }

    function updateCollapseAllButtonState() {
        if (!btnToggleCollapseAll || !btnCollapseAllText || !iconCollapseAll) return;
        const allCards = document.querySelectorAll('.product-group-card');
        if (allCards.length === 0) {
            btnToggleCollapseAll.style.display = 'none';
            return;
        }
        btnToggleCollapseAll.style.display = 'inline-flex';
        
        const collapsedCards = document.querySelectorAll('.product-group-card.is-collapsed');
        if (collapsedCards.length > 0 && collapsedCards.length === allCards.length) {
            btnCollapseAllText.textContent = '全部展开';
            iconCollapseAll.className = 'fa-solid fa-angles-down';
            btnToggleCollapseAll.title = '全部展开所有产品卡片';
        } else {
            btnCollapseAllText.textContent = '全部折叠';
            iconCollapseAll.className = 'fa-solid fa-angles-up';
            btnToggleCollapseAll.title = '全部折叠所有产品卡片以节省空间';
        }
    }

    // 刷新产品 datalist 自动联想数据
    async function refreshProductDatalist() {
        if (!productDatalist) return;
        const [products, protocols] = await Promise.all([
            window.dbHelper ? window.dbHelper.getAllProducts() : [],
            window.dbHelper ? window.dbHelper.getAllProtocols() : []
        ]);
        const set = new Set();
        (products || []).forEach(p => { if (p && p.name) set.add(p.name.trim()); });
        (protocols || []).forEach(p => { if (p && p.product) set.add(p.product.trim()); });

        productDatalist.innerHTML = '';
        set.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            productDatalist.appendChild(opt);
        });
    }

    // 创建软件配置项行元素
    function createCsciRowElement(item = { name: '', version: '' }) {
        const row = document.createElement('div');
        row.className = 'product-csci-row';
        row.innerHTML = `
            <div style="flex: 1.6;">
                <input type="text" class="csci-name-input" placeholder="软件配置项名称 (如: 主控系统软件)" value="${escapeHTML(item.name || '')}" style="height: 32px; font-size: 12.5px; width: 100%;">
            </div>
            <div style="flex: 1;">
                <input type="text" class="csci-version-input" placeholder="软件版本 (如: V1.0.0)" value="${escapeHTML(item.version || '')}" style="height: 32px; font-size: 12.5px; width: 100%;">
            </div>
            <button type="button" class="btn-del-csci" title="删除此配置项">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        const delBtn = row.querySelector('.btn-del-csci');
        delBtn.addEventListener('click', () => {
            row.remove();
            const container = document.getElementById('product-csci-list');
            if (container && container.children.length === 0) {
                container.appendChild(createCsciRowElement());
            }
        });
        return row;
    }

    // 打开新建/编辑产品弹窗
    function openProductModal(prod = null) {
        initDOMElements();
        if (!productManageModal) return;
        if (prod) {
            const titleLabel = prod.code ? `${prod.name} (${prod.code})` : prod.name;
            if (productModalTitle) productModalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square" style="color:var(--accent-color);"></i> 编辑产品型号 [${escapeHTML(titleLabel)}]`;
            if (productManageOriginalName) productManageOriginalName.value = prod.name;
            if (productManageCode) productManageCode.value = prod.code || '';
            if (productManageName) productManageName.value = prod.name;
            if (productManageDesc) productManageDesc.value = prod.desc || '';
        } else {
            if (productModalTitle) productModalTitle.innerHTML = `<i class="fa-solid fa-cubes" style="color:var(--accent-color);"></i> 新建产品型号`;
            if (productManageOriginalName) productManageOriginalName.value = '';
            if (productManageCode) productManageCode.value = '';
            if (productManageName) productManageName.value = '';
            if (productManageDesc) productManageDesc.value = '';
        }

        if (productCsciList) {
            productCsciList.innerHTML = '';
            const items = (prod && Array.isArray(prod.softwareItems) && prod.softwareItems.length > 0)
                ? prod.softwareItems
                : [{ name: '', version: '' }];
            items.forEach(it => {
                productCsciList.appendChild(createCsciRowElement(it));
            });
        }

        productManageModal.classList.add('active');
        setTimeout(() => {
            if (productManageCode) productManageCode.focus();
        }, 150);
    }

    // 全局编辑产品函数
    async function editProductByName(productName) {
        if (!productName) return;
        const products = await (window.dbHelper ? window.dbHelper.getAllProducts() : []);
        const found = products.find(p => p.name === productName) || { name: productName };
        openProductModal(found);
    }

    // 全局删除产品函数
    async function deleteProductByName(productName) {
        if (!productName) return;
        const allProtos = await (window.dbHelper ? window.dbHelper.getAllProtocols() : []);
        const related = allProtos.filter(p => (p.product || '').trim() === productName);
        
        let msg = `确定要删除产品型号「${productName}」吗？`;
        if (related.length > 0) {
            msg += `\n\n【提示】检测到当前产品下有 ${related.length} 个通信协议。删除产品后，这些协议不会被删除，而是自动移入「未分类 / 通用协议」中。`;
        }

        if (confirm(msg)) {
            for (const proto of related) {
                proto.product = '';
                await window.dbHelper.saveProtocol(proto);
                if (ProtoView.WorkspaceSync) {
                    await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(proto);
                }
            }
            await window.dbHelper.deleteProduct(productName);
            if (ProtoView.WorkspaceSync && ProtoView.WorkspaceSync.deleteProductFromCloud) {
                await ProtoView.WorkspaceSync.deleteProductFromCloud(productName);
            }
            if (activeProductFilter === productName) {
                activeProductFilter = 'all';
            }
            await refreshProductDatalist();
            await loadProtocols();
            showToast(`已删除产品型号「${productName}」`, 'info');
        }
    }

    function filterProtocolsBySearch(list, query) {
        if (!query) return list;
        const q = query.toLowerCase();
        return (list || []).filter(p => {
            if (!p) return false;
            if (p.name && p.name.toLowerCase().includes(q)) return true;
            if (p.device && p.device.toLowerCase().includes(q)) return true;
            if (p.source && p.source.toLowerCase().includes(q)) return true;
            if (p.description && p.description.toLowerCase().includes(q)) return true;
            if (p.type && p.type.toLowerCase().includes(q)) return true;
            if (p.product && p.product.toLowerCase().includes(q)) return true;
            if (p._fileName && p._fileName.toLowerCase().includes(q)) return true;
            if (p.words && p.words.some(w => (w.label && w.label.includes(q)) || (w.name && w.name.toLowerCase().includes(q)))) return true;
            if (p.packets && p.packets.some(pkt => (pkt.name && pkt.name.toLowerCase().includes(q)) || (pkt.cmd && pkt.cmd.toLowerCase().includes(q)))) return true;
            return false;
        });
    }

    // 将协议移动到指定产品下 (支持拖拽归类)
    async function moveProtocolToProduct(protoId, targetProduct) {
        if (!protoId) return;
        const proto = await (window.dbHelper ? window.dbHelper.getProtocol(protoId) : null);
        if (!proto) return;

        const cleanOldProduct = (proto.product || '').trim();
        const cleanNewProduct = (targetProduct || '').trim();

        if (cleanOldProduct === cleanNewProduct) {
            return;
        }

        proto.product = cleanNewProduct;
        await window.dbHelper.saveProtocol(proto);

        if (cleanNewProduct) {
            await window.dbHelper.saveProduct({ name: cleanNewProduct });
        }

        if (ProtoView.WorkspaceSync) {
            await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(proto);
        }

        if (cleanNewProduct && collapsedProducts.has(cleanNewProduct)) {
            collapsedProducts.delete(cleanNewProduct);
            saveCollapsedProductsState();
        } else if (!cleanNewProduct && collapsedProducts.has('__uncategorized__')) {
            collapsedProducts.delete('__uncategorized__');
            saveCollapsedProductsState();
        }

        await refreshProductDatalist();
        await loadProtocols();

        const destName = cleanNewProduct ? `产品「${cleanNewProduct}」` : '「未分类 / 通用协议」';
        showToast(`已成功将协议「${proto.name}」移入 ${destName}！`, 'success');
    }

    function renderProductFilterTabs(productMap, groupMap, totalCount) {
        if (!productTabsContainer) return;
        productTabsContainer.innerHTML = '';

        const allPill = document.createElement('button');
        allPill.type = 'button';
        allPill.className = `product-tab-pill ${activeProductFilter === 'all' ? 'active' : ''}`;
        allPill.innerHTML = `<span>全部产品</span><span class="product-tab-count">${totalCount}</span>`;
        allPill.addEventListener('click', () => {
            activeProductFilter = 'all';
            loadProtocols();
        });
        productTabsContainer.appendChild(allPill);

        const sortedNames = Array.from(productMap.keys()).sort((a, b) => a.localeCompare(b, 'zh-CN'));
        sortedNames.forEach(name => {
            const count = (groupMap.get(name) || []).length;
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = `product-tab-pill ${activeProductFilter === name ? 'active' : ''}`;
            pill.setAttribute('data-tab-product', name);
            pill.title = `点击筛选；可将协议直接拖至此处移入「${escapeHTML(name)}」`;
            pill.innerHTML = `<span><i class="fa-solid fa-cube" style="font-size:11px; margin-right:2px; opacity:0.8;"></i> ${escapeHTML(name)}</span><span class="product-tab-count">${count}</span>`;
            
            pill.addEventListener('click', () => {
                activeProductFilter = name;
                loadProtocols();
            });

            pill.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                pill.classList.add('tab-drop-hover');
            });
            pill.addEventListener('dragleave', () => {
                pill.classList.remove('tab-drop-hover');
            });
            pill.addEventListener('drop', async (e) => {
                e.preventDefault();
                pill.classList.remove('tab-drop-hover');
                const protoId = Number(e.dataTransfer.getData('text/plain') || (window._draggingProtocol && window._draggingProtocol.id));
                if (protoId) {
                    await moveProtocolToProduct(protoId, name);
                }
            });

            productTabsContainer.appendChild(pill);
        });

        const UNCATEGORIZED_KEY = '__uncategorized__';
        const uncatCount = (groupMap.get(UNCATEGORIZED_KEY) || []).length;
        if (uncatCount > 0) {
            const uncatPill = document.createElement('button');
            uncatPill.type = 'button';
            uncatPill.className = `product-tab-pill ${activeProductFilter === UNCATEGORIZED_KEY ? 'active' : ''}`;
            uncatPill.setAttribute('data-tab-product', UNCATEGORIZED_KEY);
            uncatPill.title = '点击筛选；可将协议拖至此处转为通用协议';
            uncatPill.innerHTML = `<span><i class="fa-solid fa-folder-tree" style="font-size:11px; margin-right:2px; opacity:0.8;"></i> 未分类</span><span class="product-tab-count">${uncatCount}</span>`;
            
            uncatPill.addEventListener('click', () => {
                activeProductFilter = UNCATEGORIZED_KEY;
                loadProtocols();
            });

            uncatPill.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                uncatPill.classList.add('tab-drop-hover');
            });
            uncatPill.addEventListener('dragleave', () => {
                uncatPill.classList.remove('tab-drop-hover');
            });
            uncatPill.addEventListener('drop', async (e) => {
                e.preventDefault();
                uncatPill.classList.remove('tab-drop-hover');
                const protoId = Number(e.dataTransfer.getData('text/plain') || (window._draggingProtocol && window._draggingProtocol.id));
                if (protoId) {
                    await moveProtocolToProduct(protoId, '');
                }
            });

            productTabsContainer.appendChild(uncatPill);
        }
    }

    function createProtocolCardElement(p) {
        const card = document.createElement('div');
        card.className = 'card glass-effect protocol-card';
        card.title = '点击进入编辑；按住可拖动至任意产品卡片或上方产品标签进行归类';
        card.draggable = true;
        card.setAttribute('data-protocol-id', p.id);
        card.setAttribute('data-current-product', p.product || '');

        card.addEventListener('dragstart', (e) => {
            if (e.target.closest('.protocol-actions') || e.target.closest('button')) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', p.id.toString());
            window._draggingProtocol = { id: p.id, name: p.name, currentProduct: (p.product || '').trim() };
            card.classList.add('is-dragging');
            document.body.classList.add('protocol-dragging-active');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('is-dragging');
            document.body.classList.remove('protocol-dragging-active');
            window._draggingProtocol = null;
            document.querySelectorAll('.drop-target-hover').forEach(el => el.classList.remove('drop-target-hover'));
            document.querySelectorAll('.tab-drop-hover').forEach(el => el.classList.remove('tab-drop-hover'));
        });

        card.addEventListener('click', (e) => {
            if (e.target.closest('.protocol-actions') || e.target.closest('button')) {
                return;
            }
            openProtocolWorkbench(p.id);
        });

        const productName = (p.product || '').trim();

        if (p.type === 'ARINC429') {
            const packetCount = (p.packets && Array.isArray(p.packets)) ? p.packets.length : 1;
            const modeName = p.mode === 'bitstream' ? '自由 Bit 模式' : '经典航电模式';
            const deviceName = p.device || p.source || '未指定设备';
            const parityName = p.parity === 'odd' ? '奇校验' : (p.parity === 'even' ? '偶校验' : '无校验');
            const arincTag = p.subType || 'ARINC429 (HB6096)';

            card.innerHTML = `
                <div class="protocol-card-header">
                    <div class="protocol-card-title-wrap">
                        <span class="card-drag-handle" title="按住拖拽至上方产品标签或其它产品卡片进行归类"><i class="fa-solid fa-grip-vertical"></i></span>
                        <i class="fa-solid fa-plane-departure proto-card-icon"></i>
                        <h3 class="protocol-card-title" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h3>
                    </div>
                    <span class="protocol-type-badge badge-proto-arinc">${escapeHTML(arincTag)}</span>
                </div>
                <div class="protocol-stats">
                    ${productName ? `<span class="pstat-item pstat-product" title="所属产品: ${escapeHTML(productName)}"><i class="fa-solid fa-cube"></i> ${escapeHTML(productName)}</span>` : ''}
                    <span class="pstat-item pstat-cloud" title="Cloudflare 云端分布式存储"><i class="fa-solid fa-cloud"></i> 云端保存</span>
                    <span class="pstat-item"><i class="fa-solid fa-box-archive"></i> ${packetCount} 个数据包</span>
                    <span class="pstat-item"><i class="fa-solid fa-desktop"></i> ${escapeHTML(deviceName)}</span>
                    <span class="pstat-item"><i class="fa-solid fa-clock"></i> 发送周期: ${p.period || 20}ms</span>
                    <span class="pstat-item"><i class="fa-solid fa-gauge-high"></i> ${p.speed || '100kbps'}</span>
                    <span class="pstat-item"><i class="fa-solid fa-shield-halved"></i> ${parityName}</span>
                    <span class="pstat-item"><i class="fa-solid fa-sliders"></i> ${modeName}</span>
                </div>
                <p class="protocol-card-desc">
                    ${escapeHTML(p.description || '机载 ARINC 429 航空总线通信协议')}
                </p>
                <div class="protocol-actions">
                    <button type="button" class="btn btn-sm btn-proto-open" onclick="window.openProtocolWorkbench && window.openProtocolWorkbench('${p.id}')" title="进入协议工作台编辑标号字与字段"><i class="fa-solid fa-folder-open"></i> 打开</button>
                    <button type="button" class="btn btn-sm btn-proto-edit" onclick="window.editProtocolProps && window.editProtocolProps('${p.id}')" title="编辑协议属性 (名称、产品型号、周期、速率等)"><i class="fa-solid fa-pen-to-square"></i> 编辑</button>
                    <button type="button" class="btn btn-sm btn-proto-export" onclick="window.exportProtocolById && window.exportProtocolById('${p.id}')" title="导出为电脑本地 .json 模板文件"><i class="fa-solid fa-download"></i> 导出</button>
                    <button type="button" class="btn btn-sm btn-proto-delete" onclick="window.deleteProtocol && window.deleteProtocol('${p.id}')" title="删除通信协议"><i class="fa-solid fa-trash"></i> 删除</button>
                </div>
            `;
        } else if (p.type === 'Serial') {
            const packetCount = p.packets ? p.packets.length : 0;
            const subTypeName = p.subType || 'RS485';
            const deviceName = p.device || '传感器/执行器';
            const baudStr = (p.baudRate || 115200) + ' bps';
            const formatStr = `${p.dataBits || 8}-${(p.parity || 'none')[0].toUpperCase()}-${p.stopBits || 1}`;

            card.innerHTML = `
                <div class="protocol-card-header">
                    <div class="protocol-card-title-wrap">
                        <span class="card-drag-handle" title="按住拖拽至上方产品标签或其它产品卡片进行归类"><i class="fa-solid fa-grip-vertical"></i></span>
                        <i class="fa-solid fa-bolt proto-card-icon" style="color: #f59e0b;"></i>
                        <h3 class="protocol-card-title" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h3>
                    </div>
                    <span class="protocol-type-badge badge-proto-serial">${escapeHTML(subTypeName)}</span>
                </div>
                <div class="protocol-stats">
                    ${productName ? `<span class="pstat-item pstat-product" title="所属产品: ${escapeHTML(productName)}"><i class="fa-solid fa-cube"></i> ${escapeHTML(productName)}</span>` : ''}
                    <span class="pstat-item pstat-cloud" title="Cloudflare 云端分布式存储"><i class="fa-solid fa-cloud"></i> 云端保存</span>
                    <span class="pstat-item"><i class="fa-solid fa-box-archive"></i> ${packetCount} 个数据包</span>
                    <span class="pstat-item"><i class="fa-solid fa-desktop"></i> ${escapeHTML(deviceName)}</span>
                    <span class="pstat-item"><i class="fa-solid fa-clock"></i> 发送周期: ${p.period || 20}ms</span>
                    <span class="pstat-item"><i class="fa-solid fa-gauge-high"></i> ${baudStr}</span>
                    <span class="pstat-item"><i class="fa-solid fa-microchip"></i> ${formatStr}</span>
                </div>
                <p class="protocol-card-desc">
                    ${escapeHTML(p.description || '工业/航电标准串口通信协议 (UART / RS422 / RS485)')}
                </p>
                <div class="protocol-actions">
                    <button type="button" class="btn btn-sm btn-proto-open" onclick="window.openProtocolWorkbench && window.openProtocolWorkbench('${p.id}')" title="进入串口工作台编辑数据包与字段"><i class="fa-solid fa-folder-open"></i> 打开</button>
                    <button type="button" class="btn btn-sm btn-proto-edit" onclick="window.editProtocolProps && window.editProtocolProps('${p.id}')" title="编辑协议属性 (名称、产品型号、波特率等)"><i class="fa-solid fa-pen-to-square"></i> 编辑</button>
                    <button type="button" class="btn btn-sm btn-proto-export" onclick="window.exportProtocolById && window.exportProtocolById('${p.id}')" title="导出为电脑本地 .json 模板文件"><i class="fa-solid fa-download"></i> 导出</button>
                    <button type="button" class="btn btn-sm btn-proto-delete" onclick="window.deleteProtocol && window.deleteProtocol('${p.id}')" title="删除通信协议"><i class="fa-solid fa-trash"></i> 删除</button>
                </div>
            `;
        } else {
            const canTag = p.canStandard || p.subType || 'CAN 2.0B';
            card.innerHTML = `
                <div class="protocol-card-header">
                    <div class="protocol-card-title-wrap">
                        <span class="card-drag-handle" title="按住拖拽至上方产品标签或其它产品卡片进行归类"><i class="fa-solid fa-grip-vertical"></i></span>
                        <i class="fa-solid fa-network-wired proto-card-icon"></i>
                        <h3 class="protocol-card-title" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h3>
                    </div>
                    <span class="protocol-type-badge badge-proto-can">${escapeHTML(canTag)}</span>
                </div>
                <div class="protocol-stats">
                    ${productName ? `<span class="pstat-item pstat-product" title="所属产品: ${escapeHTML(productName)}"><i class="fa-solid fa-cube"></i> ${escapeHTML(productName)}</span>` : ''}
                    <span class="pstat-item pstat-cloud" title="Cloudflare 云端分布式存储"><i class="fa-solid fa-cloud"></i> 云端保存</span>
                    <span class="pstat-item"><i class="fa-solid fa-layer-group"></i> ${p.frames ? p.frames.length : 0} 个报文</span>
                </div>
                <p class="protocol-card-desc">
                    ${escapeHTML(p.description || '工业总线通信协议')}
                </p>
                <div class="protocol-actions">
                    <button type="button" class="btn btn-sm btn-proto-open" onclick="window.openProtocolWorkbench && window.openProtocolWorkbench('${p.id}')" title="进入工作台编辑报文与信号"><i class="fa-solid fa-folder-open"></i> 打开</button>
                    <button type="button" class="btn btn-sm btn-proto-edit" onclick="window.editProtocolProps && window.editProtocolProps('${p.id}')" title="编辑协议属性 (名称、产品型号、周期等)"><i class="fa-solid fa-pen-to-square"></i> 编辑</button>
                    <button type="button" class="btn btn-sm btn-proto-export" onclick="window.exportProtocolById && window.exportProtocolById('${p.id}')" title="导出为电脑本地 .json 模板文件"><i class="fa-solid fa-download"></i> 导出</button>
                    <button type="button" class="btn btn-sm btn-proto-delete" onclick="window.deleteProtocol && window.deleteProtocol('${p.id}')" title="删除通信协议"><i class="fa-solid fa-trash"></i> 删除</button>
                </div>
            `;
        }
        return card;
    }

    // 载入协议库与产品中心
    async function loadProtocols() {
        initDOMElements();
        if (!protocolList) return;
        const [protocols, products] = await Promise.all([
            window.dbHelper ? window.dbHelper.getAllProtocols() : [],
            window.dbHelper ? window.dbHelper.getAllProducts() : []
        ]);
        await refreshProductDatalist();

        // 实时更新侧边栏协议数量徽章
        const sidebarProtoBadge = document.getElementById('sidebar-proto-count-badge');
        if (sidebarProtoBadge) {
            sidebarProtoBadge.textContent = (protocols || []).length;
        }

        const productMap = new Map();
        (products || []).forEach(p => {
            if (p && p.name) {
                productMap.set(p.name.trim(), {
                    name: p.name.trim(),
                    code: p.code || '',
                    desc: p.desc || '',
                    softwareItems: Array.isArray(p.softwareItems) ? p.softwareItems : []
                });
            }
        });

        (protocols || []).forEach(p => {
            const pName = (p.product || '').trim();
            if (pName && !productMap.has(pName)) {
                productMap.set(pName, {
                    name: pName,
                    code: '',
                    desc: '',
                    softwareItems: []
                });
            }
        });

        const UNCATEGORIZED_KEY = '__uncategorized__';
        const groupMap = new Map();

        for (const [prodName] of productMap) {
            groupMap.set(prodName, []);
        }
        groupMap.set(UNCATEGORIZED_KEY, []);

        (protocols || []).forEach(p => {
            const pName = (p.product || '').trim();
            if (pName) {
                if (!groupMap.has(pName)) groupMap.set(pName, []);
                groupMap.get(pName).push(p);
            } else {
                groupMap.get(UNCATEGORIZED_KEY).push(p);
            }
        });

        renderProductFilterTabs(productMap, groupMap, protocols ? protocols.length : 0);

        if ((!protocols || protocols.length === 0) && productMap.size === 0) {
            protocolList.innerHTML = `
                <div class="empty-state" style="padding: 3.5rem 1.5rem; text-align: center; background: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: 12px;">
                    <i class="fa-solid fa-cubes" style="font-size: 2.5rem; color: var(--accent-color); margin-bottom: 0.8rem; display: block; opacity: 0.85;"></i>
                    <h3 style="font-size: 1.15rem; color: var(--text-primary); margin-bottom: 0.4rem;">暂无通信协议与产品</h3>
                    <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 1.2rem; max-width: 520px; margin-left: auto; margin-right: auto; line-height: 1.5;">
                        在航电与工业系统中，协议通常归属于特定产品设备。您可以先点击「新建产品」再在其下录入协议，或直接点击「新建协议」随手创建。
                    </p>
                    <div style="display: inline-flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button type="button" class="btn btn-secondary" onclick="window.openProductModal()"><i class="fa-solid fa-cubes"></i> 新建产品型号</button>
                        <button type="button" class="btn btn-primary" onclick="window.openCreate429Modal()"><i class="fa-solid fa-plus"></i> 新建通信协议</button>
                    </div>
                </div>
            `;
            return;
        }

        protocolList.innerHTML = '';

        const sortedProductNames = Array.from(productMap.keys()).sort((a, b) => a.localeCompare(b, 'zh-CN'));
        const uncategorizedList = groupMap.get(UNCATEGORIZED_KEY) || [];
        const hasUncategorized = uncategorizedList.length > 0;
        let renderedGroupCount = 0;

        sortedProductNames.forEach(prodName => {
            if (activeProductFilter !== 'all' && activeProductFilter !== prodName) {
                return;
            }

            const prodInfo = productMap.get(prodName);
            const protoList = groupMap.get(prodName) || [];

            const filteredProtos = filterProtocolsBySearch(protoList, productSearchQuery);
            const isProductSelfMatch = productSearchQuery && (
                prodName.toLowerCase().includes(productSearchQuery) ||
                (prodInfo.code && prodInfo.code.toLowerCase().includes(productSearchQuery)) ||
                (prodInfo.desc && prodInfo.desc.toLowerCase().includes(productSearchQuery)) ||
                (prodInfo.softwareItems && prodInfo.softwareItems.some(s => (s.name && s.name.toLowerCase().includes(productSearchQuery)) || (s.version && s.version.toLowerCase().includes(productSearchQuery))))
            );

            if (productSearchQuery && !isProductSelfMatch && filteredProtos.length === 0) {
                return;
            }

            const protosToRender = isProductSelfMatch ? protoList : filteredProtos;

            const groupCard = document.createElement('div');
            groupCard.className = 'product-group-card';
            groupCard.setAttribute('data-product-name', prodName);

            const isCollapsed = collapsedProducts.has(prodName);
            if (isCollapsed && !productSearchQuery) {
                groupCard.classList.add('is-collapsed');
            }

            groupCard.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (window._draggingProtocol && window._draggingProtocol.currentProduct === prodName) {
                    return;
                }
                groupCard.classList.add('drop-target-hover');
            });

            groupCard.addEventListener('dragleave', (e) => {
                if (!groupCard.contains(e.relatedTarget)) {
                    groupCard.classList.remove('drop-target-hover');
                }
            });

            groupCard.addEventListener('drop', async (e) => {
                e.preventDefault();
                groupCard.classList.remove('drop-target-hover');
                document.body.classList.remove('protocol-dragging-active');
                const protoId = Number(e.dataTransfer.getData('text/plain') || (window._draggingProtocol && window._draggingProtocol.id));
                if (protoId) {
                    await moveProtocolToProduct(protoId, prodName);
                }
            });

            groupCard.innerHTML = `
                <div class="product-group-header">
                    <div class="product-group-left product-group-header-clickable" title="点击折叠或展开「${escapeHTML(prodName)}」的协议列表">
                        <button type="button" class="btn-product-collapse" title="折叠/展开此产品">
                            <i class="fa-solid fa-chevron-down"></i>
                        </button>
                        <div class="product-group-icon">
                            <i class="fa-solid fa-cubes"></i>
                        </div>
                        <div class="product-group-meta">
                            <div class="product-group-title-row">
                                <h2 class="product-group-title">${escapeHTML(prodName)}</h2>
                                ${prodInfo.code ? `<span class="product-code-badge" title="产品型号: ${escapeHTML(prodInfo.code)}"><i class="fa-solid fa-tag"></i> ${escapeHTML(prodInfo.code)}</span>` : ''}
                                <span class="product-proto-count-badge">${protoList.length} 包协议</span>
                                ${prodInfo.softwareItems && prodInfo.softwareItems.length > 0 ? `
                                    <span class="product-csci-summary-badge" title="包含 ${prodInfo.softwareItems.length} 个软件配置项">
                                        <i class="fa-solid fa-code-branch"></i> ${prodInfo.softwareItems.length} 个配置项
                                    </span>
                                ` : ''}
                                <span class="product-collapsed-tag"><i class="fa-solid fa-angles-down"></i> 已折叠 (点击展开)</span>
                                <span class="product-drop-indicator"><i class="fa-solid fa-arrow-down-to-bracket"></i> 释放移入此产品</span>
                            </div>
                            ${prodInfo.softwareItems && prodInfo.softwareItems.length > 0 ? `
                                <div class="product-csci-tag-list">
                                    ${prodInfo.softwareItems.map(s => `
                                        <span class="product-csci-item-chip" title="软件配置项: ${escapeHTML(s.name)}${s.version ? ` (版本: ${escapeHTML(s.version)})` : ''}">
                                            <i class="fa-solid fa-code-branch"></i> ${escapeHTML(s.name)}
                                            ${s.version ? `<span class="csci-ver-badge">${escapeHTML(s.version)}</span>` : ''}
                                        </span>
                                    `).join('')}
                                </div>
                            ` : ''}
                            ${prodInfo.desc ? `<p class="product-group-desc" title="${escapeHTML(prodInfo.desc)}">${escapeHTML(prodInfo.desc)}</p>` : ''}
                        </div>
                    </div>
                    <div class="product-group-right">
                        <button type="button" class="btn-product-add-proto" title="在产品「${escapeHTML(prodName)}」下新建协议" onclick="window.openCreate429Modal('', '${escapeHTML(prodName)}')">
                            <i class="fa-solid fa-plus"></i> 此产品下新建协议
                        </button>
                        <button type="button" class="btn-product-tool" title="编辑产品信息" onclick="window.editProductByName('${escapeHTML(prodName)}')">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="btn-product-tool danger" title="删除该产品" onclick="window.deleteProductByName('${escapeHTML(prodName)}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="product-protocols-grid">
                    <!-- 协议卡片 -->
                </div>
            `;

            const headerLeft = groupCard.querySelector('.product-group-left');
            if (headerLeft) {
                headerLeft.addEventListener('click', () => {
                    if (groupCard.classList.contains('is-collapsed')) {
                        groupCard.classList.remove('is-collapsed');
                        collapsedProducts.delete(prodName);
                    } else {
                        groupCard.classList.add('is-collapsed');
                        collapsedProducts.add(prodName);
                    }
                    saveCollapsedProductsState();
                    updateCollapseAllButtonState();
                });
            }

            const grid = groupCard.querySelector('.product-protocols-grid');
            if (protosToRender.length === 0) {
                grid.innerHTML = `
                    <div class="product-empty-protos" style="grid-column: 1 / -1;">
                        <i class="fa-solid fa-folder-open"></i>
                        <div>该产品下暂无协议。点击右上角「+ 此产品下新建协议」即可快速为此产品创建协议包。</div>
                    </div>
                `;
            } else {
                protosToRender.forEach(p => {
                    grid.appendChild(createProtocolCardElement(p));
                });
            }

            protocolList.appendChild(groupCard);
            renderedGroupCount++;
        });

        if (hasUncategorized && (activeProductFilter === 'all' || activeProductFilter === UNCATEGORIZED_KEY)) {
            const filteredUncategorized = filterProtocolsBySearch(uncategorizedList, productSearchQuery);
            if (!productSearchQuery || filteredUncategorized.length > 0) {
                const groupCard = document.createElement('div');
                groupCard.className = 'product-group-card is-uncategorized';
                groupCard.setAttribute('data-product-name', '__uncategorized__');

                const isUncatCollapsed = collapsedProducts.has('__uncategorized__');
                if (isUncatCollapsed && !productSearchQuery) {
                    groupCard.classList.add('is-collapsed');
                }

                groupCard.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (window._draggingProtocol && !window._draggingProtocol.currentProduct) {
                        return;
                    }
                    groupCard.classList.add('drop-target-hover');
                });

                groupCard.addEventListener('dragleave', (e) => {
                    if (!groupCard.contains(e.relatedTarget)) {
                        groupCard.classList.remove('drop-target-hover');
                    }
                });

                groupCard.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    groupCard.classList.remove('drop-target-hover');
                    document.body.classList.remove('protocol-dragging-active');
                    const protoId = Number(e.dataTransfer.getData('text/plain') || (window._draggingProtocol && window._draggingProtocol.id));
                    if (protoId) {
                        await moveProtocolToProduct(protoId, '');
                    }
                });

                groupCard.innerHTML = `
                    <div class="product-group-header">
                        <div class="product-group-left product-group-header-clickable" title="点击折叠或展开未分类协议列表">
                            <button type="button" class="btn-product-collapse" title="折叠/展开未分类协议">
                                <i class="fa-solid fa-chevron-down"></i>
                            </button>
                            <div class="product-group-icon">
                                <i class="fa-solid fa-folder-tree"></i>
                            </div>
                            <div class="product-group-meta">
                                <div class="product-group-title-row">
                                    <h2 class="product-group-title">未分类 / 通用协议</h2>
                                    <span class="product-proto-count-badge" style="background:rgba(100,116,139,0.15); color:#64748b;">${uncategorizedList.length} 包协议</span>
                                    <span class="product-collapsed-tag"><i class="fa-solid fa-angles-down"></i> 已折叠 (点击展开)</span>
                                    <span class="product-drop-indicator"><i class="fa-solid fa-arrow-down-to-bracket"></i> 释放转为未分类通用</span>
                                </div>
                                <p class="product-group-desc">未指定所属产品型号的通信协议，可直接将协议拖入此处解除产品归属，或拖动至上方产品。</p>
                            </div>
                        </div>
                        <div class="product-group-right">
                            <button type="button" class="btn-product-add-proto" style="background:rgba(100,116,139,0.12); color:#64748b; border-color:rgba(100,116,139,0.25);" onclick="window.openCreate429Modal('', '')">
                                <i class="fa-solid fa-plus"></i> 新建通用协议
                            </button>
                        </div>
                    </div>
                    <div class="product-protocols-grid"></div>
                `;

                const uncatHeaderLeft = groupCard.querySelector('.product-group-left');
                if (uncatHeaderLeft) {
                    uncatHeaderLeft.addEventListener('click', () => {
                        if (groupCard.classList.contains('is-collapsed')) {
                            groupCard.classList.remove('is-collapsed');
                            collapsedProducts.delete('__uncategorized__');
                        } else {
                            groupCard.classList.add('is-collapsed');
                            collapsedProducts.add('__uncategorized__');
                        }
                        saveCollapsedProductsState();
                        updateCollapseAllButtonState();
                    });
                }

                const grid = groupCard.querySelector('.product-protocols-grid');
                filteredUncategorized.forEach(p => {
                    grid.appendChild(createProtocolCardElement(p));
                });
                protocolList.appendChild(groupCard);
                renderedGroupCount++;
            }
        }

        updateCollapseAllButtonState();

        if (renderedGroupCount === 0) {
            protocolList.innerHTML = `
                <div class="empty-state" style="padding: 3rem 1.5rem; text-align: center; background: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: 12px;">
                    <i class="fa-solid fa-magnifying-glass" style="font-size: 2rem; color: var(--text-secondary); margin-bottom: 0.6rem; display: block; opacity: 0.6;"></i>
                    <h3 style="font-size: 1.05rem; color: var(--text-primary); margin-bottom: 0.3rem;">未找到匹配的产品或协议</h3>
                    <p style="font-size: 0.85rem; color: var(--text-secondary);">请尝试更换搜索关键字或切换产品标签。</p>
                </div>
            `;
        }
    }

    async function loadProtocolsForSelect() {
        const selectProtocolParse = document.getElementById('select-protocol-parse');
        if (!selectProtocolParse) return;
        const protocols = await (window.dbHelper ? window.dbHelper.getAllProtocols() : []);
        selectProtocolParse.innerHTML = '<option value="">-- 请选择协议 --</option>';
        protocols.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            const prodPrefix = p.product ? `[${p.product}] ` : '';
            option.textContent = `[${p.type}] ${prodPrefix}${p.name}`;
            selectProtocolParse.appendChild(option);
        });
    }

    // 删除协议
    async function deleteProtocol(id) {
        const proto = await (window.dbHelper ? window.dbHelper.getProtocol(id) : null);
        const name = proto ? proto.name : '该协议';

        if (confirm(`确定要删除通信协议「${name}」吗？\n\n此操作将同步从 Cloudflare 云端数据库中彻底删除，不可恢复。`)) {
            if (ProtoView.WorkspaceSync) {
                await ProtoView.WorkspaceSync.deleteProtocolFile(proto);
            }
            await window.dbHelper.deleteProtocol(id);
            if (ProtoView.Controllers.Arinc) {
                const curArinc = ProtoView.Controllers.Arinc.getCurrentProtocol();
                if (curArinc && curArinc.id === Number(id)) {
                    ProtoView.Controllers.Arinc.setCurrentProtocol(null);
                }
            }
            if (ProtoView.Controllers.Serial) {
                const curSerial = ProtoView.Controllers.Serial.getCurrentProtocol();
                if (curSerial && curSerial.id === Number(id)) {
                    ProtoView.Controllers.Serial.setCurrentProtocol(null);
                }
            }
            await loadProtocols();
            if (typeof window.loadArincProtocolsForSelect === 'function') {
                await window.loadArincProtocolsForSelect();
            }
            showToast(`已删除协议「${name}」`, 'info');
        }
    }

    // 进入全量工作台
    async function openProtocolWorkbench(id) {
        const p = await (window.dbHelper ? window.dbHelper.getProtocol(id) : null);
        if (!p) return;

        if (p.type === 'ARINC429') {
            if (typeof window.switchToView === 'function') window.switchToView('arinc429-view');
            if (typeof window.loadArincProtocolIntoEditor === 'function') {
                await window.loadArincProtocolIntoEditor(p.id);
            }
            return;
        }

        if (p.type === 'Serial') {
            if (typeof window.switchToView === 'function') window.switchToView('serial-view');
            if (typeof window.loadSerialProtocolIntoEditor === 'function') {
                await window.loadSerialProtocolIntoEditor(p.id);
            }
            return;
        }

        // CAN / 其它总线协议属性配置
        await openProtocolPropsModal(p);
    }

    // 辅助切换不同接口类型的表单字段分栏展示
    function refreshTypeSpecificSections(type) {
        initDOMElements();
        const effectiveType = type || 'ARINC429';

        const isArinc = effectiveType === 'ARINC429';
        const isSerial = effectiveType === 'Serial';
        const isCan = effectiveType === 'CAN';

        document.querySelectorAll('.section-type-arinc').forEach(el => el.style.display = isArinc ? '' : 'none');
        document.querySelectorAll('.section-type-serial').forEach(el => el.style.display = isSerial ? '' : 'none');
        document.querySelectorAll('.section-type-can').forEach(el => el.style.display = isCan ? '' : 'none');

        if (protoFormPeriodHint) {
            if (isArinc) {
                protoFormPeriodHint.textContent = '429 数据字通信调度基准周期 (推荐 10~100ms)';
            } else if (isSerial) {
                protoFormPeriodHint.textContent = '串口数据包通信调度基准周期 (推荐 20~1000ms)';
            } else if (isCan) {
                protoFormPeriodHint.textContent = 'CAN 周期报文发送基准周期 (推荐 10~500ms)';
            } else {
                protoFormPeriodHint.textContent = '通信调度基准周期 (ms)';
            }
        }
    }

    // 打开统一新建协议对话框 (接口类型自由自选，参数与编辑弹窗完全一致)
    function openCreate429Modal(defaultName = '', targetProduct = '', defaultType = 'ARINC429') {
        try {
            initDOMElements();
            if (!protocolConfigModal) protocolConfigModal = document.getElementById('protocol-config-modal');
            if (!protocolConfigModal) {
                console.error("未找到 protocol-config-modal 元素！");
                alert("未找到协议配置弹窗组件，请刷新页面！");
                return;
            }

            // 切换为新建模式
            if (protoFormMode) protoFormMode.value = 'create';
            if (protoFormId) protoFormId.value = '';
            if (protoFormLockedType) protoFormLockedType.value = '';

            if (protoModalTitle) {
                protoModalTitle.innerHTML = `<i class="fa-solid fa-folder-plus" style="color:var(--accent-color);"></i> 新建通信协议`;
            }
            if (btnProtoSubmitText) {
                btnProtoSubmitText.textContent = '创建协议并进入工作台';
            }

            // 解除接口类型及架构锁定，新建模式下允许自由选择
            if (protoFormType) {
                protoFormType.value = defaultType;
                protoFormType.disabled = false;
            }
            if (protoTypeLockBadge) protoTypeLockBadge.style.display = 'none';

            if (protoArincSubtype) {
                protoArincSubtype.value = 'ARINC429 (HB6096)';
                protoArincSubtype.disabled = false;
            }
            if (protoArincSubtypeLockBadge) protoArincSubtypeLockBadge.style.display = 'none';

            if (protoArincMode) {
                protoArincMode.value = 'classic';
                protoArincMode.disabled = false;
            }
            if (protoArincModeLockBadge) protoArincModeLockBadge.style.display = 'none';

            if (protoSerialSubtype) {
                protoSerialSubtype.value = 'RS485';
                protoSerialSubtype.disabled = false;
            }
            if (protoSerialSubtypeLockBadge) protoSerialSubtypeLockBadge.style.display = 'none';

            if (protoCanStandard) {
                protoCanStandard.value = 'CAN2.0B';
                protoCanStandard.disabled = false;
            }
            if (protoCanStandardLockBadge) protoCanStandardLockBadge.style.display = 'none';

            // 默认协议名称
            if (protoFormName) {
                if (defaultName) {
                    protoFormName.value = defaultName;
                } else if (defaultType === 'Serial') {
                    protoFormName.value = '新建串口通信协议 (RS485)';
                } else if (defaultType === 'CAN') {
                    protoFormName.value = '新建 CAN 报文通信协议';
                } else {
                    protoFormName.value = '新建 ARINC 429 协议';
                }
            }

            if (protoFormProduct) protoFormProduct.value = targetProduct || '';
            if (protoFormDevice) {
                protoFormDevice.value = targetProduct ? `${targetProduct}系统` : '';
            }
            if (protoFormPeriod) protoFormPeriod.value = 20;

            // ARINC 默认值
            if (protoArincSpeed) protoArincSpeed.value = '100kbps';
            if (protoArincParity) protoArincParity.value = 'odd';

            // 串口默认值
            if (protoSerialBaud) protoSerialBaud.value = '115200';
            if (protoSerialDataBits) protoSerialDataBits.value = '8';
            if (protoSerialParity) protoSerialParity.value = 'none';
            if (protoSerialStopBits) protoSerialStopBits.value = '1';

            // CAN 默认值
            if (protoCanBaud) protoCanBaud.value = '500000';

            if (protoFormDesc) protoFormDesc.value = '';
            if (protoFormSummaryBox) protoFormSummaryBox.style.display = 'none';

            refreshTypeSpecificSections(defaultType);
            if (typeof refreshProductDatalist === 'function') {
                refreshProductDatalist().catch(err => console.warn("refreshProductDatalist error:", err));
            }

            protocolConfigModal.classList.add('active');
            if (protoFormName) protoFormName.focus();
        } catch (err) {
            console.error("打开新建协议弹窗失败:", err);
            alert("打开新建协议弹窗失败: " + err.message);
        }
    }

    // 打开统一协议属性配置对话框 (编辑模式：接口类型及不可逆架构参数强制锁定，其余参数保持一致可编辑)
    async function openProtocolPropsModal(idOrProto = null) {
        try {
            initDOMElements();
            if (!protocolConfigModal) protocolConfigModal = document.getElementById('protocol-config-modal');
            if (!protocolConfigModal) {
                console.error("未找到 protocol-config-modal 元素！");
                alert("未找到协议配置弹窗组件，请刷新页面！");
                return;
            }

            let p = idOrProto;
            if (typeof idOrProto === 'number' || typeof idOrProto === 'string') {
                p = await window.dbHelper.getProtocol(idOrProto);
            }
            if (!p) {
                p = (ProtoView.Controllers.Serial && ProtoView.Controllers.Serial.getCurrentProtocol && ProtoView.Controllers.Serial.getCurrentProtocol()) ||
                    (ProtoView.Controllers.Arinc && ProtoView.Controllers.Arinc.getCurrentProtocol && ProtoView.Controllers.Arinc.getCurrentProtocol());
            }
            if (!p) {
                alert('请先选择或创建一个通信协议！');
                return;
            }

            const protoType = p.type || 'ARINC429';

            // 切换为编辑模式
            if (protoFormMode) protoFormMode.value = 'edit';
            if (protoFormId) protoFormId.value = p.id || '';
            if (protoFormLockedType) protoFormLockedType.value = protoType;

            if (protoModalTitle) {
                protoModalTitle.innerHTML = `<i class="fa-solid fa-sliders" style="color:var(--accent-color);"></i> 协议属性配置 [${escapeHTML(p.name || '通信协议')}]`;
            }
            if (btnProtoSubmitText) {
                btnProtoSubmitText.textContent = '保存属性修改';
            }

            // 核心要求：编辑协议时锁死协议接口类型及底层架构参数，绝不允许随意更改
            if (protoFormType) {
                protoFormType.value = protoType;
                protoFormType.disabled = true;
            }
            if (protoTypeLockBadge) protoTypeLockBadge.style.display = 'inline-flex';

            if (protoArincSubtype) {
                protoArincSubtype.value = p.subType || 'ARINC429 (HB6096)';
                protoArincSubtype.disabled = true;
            }
            if (protoArincSubtypeLockBadge) protoArincSubtypeLockBadge.style.display = 'inline-flex';

            if (protoArincMode) {
                protoArincMode.value = p.mode || 'classic';
                protoArincMode.disabled = true;
            }
            if (protoArincModeLockBadge) protoArincModeLockBadge.style.display = 'inline-flex';

            if (protoSerialSubtype) {
                protoSerialSubtype.value = p.subType || 'RS485';
                protoSerialSubtype.disabled = true;
            }
            if (protoSerialSubtypeLockBadge) protoSerialSubtypeLockBadge.style.display = 'inline-flex';

            if (protoCanStandard) {
                protoCanStandard.value = p.canStandard || 'CAN2.0B';
                protoCanStandard.disabled = true;
            }
            if (protoCanStandardLockBadge) protoCanStandardLockBadge.style.display = 'inline-flex';

            // 填入所有基本参数与接口专有参数
            if (protoFormName) protoFormName.value = p.name || '';
            if (protoFormProduct) protoFormProduct.value = p.product || '';
            if (protoFormDevice) protoFormDevice.value = p.device || p.source || (p.product ? `${p.product}系统` : '机载航电系统');
            if (protoFormPeriod) protoFormPeriod.value = p.period || 20;

            if (protoType === 'ARINC429') {
                if (protoArincSpeed) protoArincSpeed.value = p.speed || '100kbps';
                if (protoArincParity) protoArincParity.value = p.parity || 'odd';
            } else if (protoType === 'Serial') {
                if (protoSerialBaud) protoSerialBaud.value = p.baudRate || 115200;
                if (protoSerialDataBits) protoSerialDataBits.value = p.dataBits || 8;
                if (protoSerialParity) protoSerialParity.value = p.parity || 'none';
                if (protoSerialStopBits) protoSerialStopBits.value = p.stopBits || 1;
            } else if (protoType === 'CAN') {
                if (protoCanBaud) protoCanBaud.value = p.baudRate || 500000;
            }

            if (protoFormDesc) protoFormDesc.value = p.description || '';

            // 摘要统计盒
            if (protoFormSummaryBox) {
                protoFormSummaryBox.style.display = 'flex';
                if (protoSummaryIdVal) protoSummaryIdVal.textContent = p.id ? `#${p.id}` : '(新)';
                if (protoSummaryCountLabel && protoSummaryCountVal) {
                    if (protoType === 'ARINC429') {
                        protoSummaryCountLabel.textContent = '标号字数量';
                        protoSummaryCountVal.textContent = `${p.words ? p.words.length : 0} 个标号字`;
                    } else if (protoType === 'Serial') {
                        protoSummaryCountLabel.textContent = '数据包数量';
                        protoSummaryCountVal.textContent = `${p.packets ? p.packets.length : 0} 个数据包`;
                    } else {
                        protoSummaryCountLabel.textContent = '报文数量';
                        protoSummaryCountVal.textContent = `${p.frames ? p.frames.length : 0} 个报文`;
                    }
                }
            }

            refreshTypeSpecificSections(protoType);
            if (typeof refreshProductDatalist === 'function') {
                refreshProductDatalist().catch(err => console.warn("refreshProductDatalist error:", err));
            }

            protocolConfigModal.classList.add('active');
        } catch (err) {
            console.error("打开协议属性配置弹窗失败:", err);
            alert("打开协议属性配置弹窗失败: " + err.message);
        }
    }

    // 提前全局挂载，防止异步加载时序导致的点击未响应
    global.openCreate429Modal = openCreate429Modal;
    global.openCreateProtocolModal = openCreate429Modal;
    global.openProtocolPropsModal = openProtocolPropsModal;
    global.openProps429Modal = openProtocolPropsModal;
    global.editProtocolProps = openProtocolPropsModal;
    global.editProtocol = openProtocolPropsModal;

    // 根据指定协议ID直接导出本地文件
    async function exportProtocolById(id) {
        const proto = await (window.dbHelper ? window.dbHelper.getProtocol(id) : null);
        if (!proto) {
            alert("未找到该协议！");
            return;
        }
        const safeName = (proto.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
        downloadFile(JSON.stringify(proto, null, 2), `${safeName}.json`, 'application/json');
    }

    // 绑定事件
    function bindProductEvents() {
        initDOMElements();

        if (btnToggleCollapseAll) {
            btnToggleCollapseAll.addEventListener('click', () => {
                const allCards = document.querySelectorAll('.product-group-card');
                const collapsedCards = document.querySelectorAll('.product-group-card.is-collapsed');
                const shouldCollapse = (collapsedCards.length < allCards.length);

                allCards.forEach(card => {
                    const pName = card.getAttribute('data-product-name');
                    if (shouldCollapse) {
                        card.classList.add('is-collapsed');
                        if (pName) collapsedProducts.add(pName);
                    } else {
                        card.classList.remove('is-collapsed');
                        if (pName) collapsedProducts.delete(pName);
                    }
                });
                saveCollapsedProductsState();
                updateCollapseAllButtonState();
            });
        }

        if (btnCreateProduct) {
            btnCreateProduct.addEventListener('click', () => openProductModal());
        }

        if (btnAddProductCsci) {
            btnAddProductCsci.addEventListener('click', () => {
                if (!productCsciList) productCsciList = document.getElementById('product-csci-list');
                if (productCsciList) {
                    const newRow = createCsciRowElement();
                    productCsciList.appendChild(newRow);
                    const nameInput = newRow.querySelector('.csci-name-input');
                    if (nameInput) nameInput.focus();
                }
            });
        }

        if (productManageForm) {
            productManageForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const originalName = (productManageOriginalName ? productManageOriginalName.value.trim() : '');
                const code = (productManageCode ? productManageCode.value.trim() : '');
                const name = (productManageName ? productManageName.value.trim() : '');
                const desc = (productManageDesc ? productManageDesc.value.trim() : '');

                if (!code) {
                    alert("请输入产品型号！");
                    if (productManageCode) productManageCode.focus();
                    return;
                }
                if (!name) {
                    alert("请输入产品名称！");
                    if (productManageName) productManageName.focus();
                    return;
                }

                const softwareItems = [];
                if (productCsciList) {
                    productCsciList.querySelectorAll('.product-csci-row').forEach(row => {
                        const nInput = row.querySelector('.csci-name-input');
                        const vInput = row.querySelector('.csci-version-input');
                        const sName = nInput ? nInput.value.trim() : '';
                        const sVer = vInput ? vInput.value.trim() : '';
                        if (sName || sVer) {
                            softwareItems.push({
                                name: sName || '未命名配置项',
                                version: sVer
                            });
                        }
                    });
                }

                if (originalName && originalName !== name) {
                    await window.dbHelper.renameProduct(originalName, name);
                }
                await window.dbHelper.saveProduct({ name, code, desc, softwareItems });

                // 立即持久化同步到云端 (支持即便当前没有任何协议，产品型号也能独立持久化)
                let cloudRes = { ok: true };
                if (ProtoView.WorkspaceSync && ProtoView.WorkspaceSync.syncProductsToCloud) {
                    cloudRes = await ProtoView.WorkspaceSync.syncProductsToCloud();
                }

                if (productManageModal) productManageModal.classList.remove('active');
                await refreshProductDatalist();
                await loadProtocols();

                if (cloudRes && cloudRes.ok) {
                    showToast(`产品型号「${name}」已保存并同步至云端！`, 'success');
                } else {
                    alert(`【警告】产品型号「${name}」在本地保存成功，但同步至云端数据库受阻：\n${cloudRes ? cloudRes.error : '未知异常'}\n\n请检查 Cloudflare 数据库/存储桶连接。`);
                }
            });
        }

        if (productProtoSearch) {
            productProtoSearch.addEventListener('input', (e) => {
                productSearchQuery = e.target.value.trim().toLowerCase();
                if (btnClearProductSearch) {
                    btnClearProductSearch.style.display = productSearchQuery ? 'flex' : 'none';
                }
                loadProtocols();
            });
        }

        if (btnClearProductSearch) {
            btnClearProductSearch.addEventListener('click', () => {
                if (productProtoSearch) {
                    productProtoSearch.value = '';
                    productSearchQuery = '';
                    btnClearProductSearch.style.display = 'none';
                    loadProtocols();
                    productProtoSearch.focus();
                }
            });
        }

        if (btnCreateProtocol) {
            btnCreateProtocol.addEventListener('click', () => openCreate429Modal());
        }

        if (protoFormType) {
            protoFormType.addEventListener('change', () => {
                const newType = protoFormType.value;
                refreshTypeSpecificSections(newType);

                // 在新建模式下，若当前名称为默认模板名称，联动切换默认名称
                if (protoFormMode && protoFormMode.value === 'create' && protoFormName) {
                    const curName = protoFormName.value.trim();
                    if (!curName || curName.includes('ARINC 429') || curName.includes('串口通信协议') || curName.includes('CAN 报文通信协议')) {
                        if (newType === 'Serial') {
                            protoFormName.value = '新建串口通信协议 (RS485)';
                        } else if (newType === 'CAN') {
                            protoFormName.value = '新建 CAN 报文通信协议';
                        } else {
                            protoFormName.value = '新建 ARINC 429 协议';
                        }
                    }
                }
            });
        }

        // 统一协议配置表单提交处理 (新建与编辑统一流)
        if (protocolConfigForm) {
            protocolConfigForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const isEdit = (protoFormMode && protoFormMode.value === 'edit');
                    const targetId = Number(protoFormId ? protoFormId.value : 0);

                    // 获取总线类型（若被锁定 disabled，则从 lockedType 恢复）
                    let protoType = protoFormLockedType && protoFormLockedType.value ? protoFormLockedType.value : (protoFormType ? protoFormType.value : 'ARINC429');
                    if (!isEdit && protoFormType) {
                        protoType = protoFormType.value || 'ARINC429';
                    }

                    const name = (protoFormName ? protoFormName.value.trim() : '') || (protoType === 'Serial' ? '未命名串口协议' : (protoType === 'CAN' ? '未命名CAN协议' : '未命名429协议'));
                    const product = (protoFormProduct ? protoFormProduct.value.trim() : '');
                    if (product) {
                        await window.dbHelper.saveProduct({ name: product });
                        if (ProtoView.WorkspaceSync && ProtoView.WorkspaceSync.syncProductsToCloud) {
                            await ProtoView.WorkspaceSync.syncProductsToCloud();
                        }
                    }
                    const device = (protoFormDevice ? protoFormDevice.value.trim() : '') || (product ? `${product}系统` : '机载航电系统');
                    const period = parseInt(protoFormPeriod ? protoFormPeriod.value : 20) || 20;
                    const desc = (protoFormDesc ? protoFormDesc.value.trim() : '') || `${protoType} 通信总线协议`;

                    if (isEdit) {
                        // ========================= 编辑模式 =========================
                        let targetProto = null;
                        if (targetId) {
                            targetProto = await window.dbHelper.getProtocol(targetId);
                        }
                        if (!targetProto) {
                            alert("未找到要更新的协议数据！");
                            return;
                        }

                        // 协议总线类型保持原值绝不更改
                        targetProto.name = name;
                        targetProto.product = product;
                        targetProto.device = device;
                        targetProto.source = device;
                        targetProto.period = period;
                        targetProto.description = desc;

                        if (targetProto.type === 'ARINC429') {
                            targetProto.subType = protoArincSubtype ? protoArincSubtype.value : (targetProto.subType || 'ARINC429 (HB6096)');
                            targetProto.speed = protoArincSpeed ? protoArincSpeed.value : '100kbps';
                            targetProto.parity = protoArincParity ? protoArincParity.value : 'odd';
                            // mode 锁定保持原值

                            if (targetProto.words) {
                                targetProto.words.forEach(w => {
                                    w.period = period;
                                });
                            }

                            if (ProtoView.Controllers.Arinc) {
                                const curArinc = ProtoView.Controllers.Arinc.getCurrentProtocol();
                                if (curArinc && curArinc.id === targetProto.id) {
                                    Object.assign(curArinc, targetProto);
                                }
                            }
                        } else if (targetProto.type === 'Serial') {
                            // subType 锁定保持原值
                            targetProto.baudRate = Number(protoSerialBaud ? protoSerialBaud.value : 115200);
                            targetProto.dataBits = Number(protoSerialDataBits ? protoSerialDataBits.value : 8);
                            targetProto.parity = protoSerialParity ? protoSerialParity.value : 'none';
                            targetProto.stopBits = Number(protoSerialStopBits ? protoSerialStopBits.value : 1);

                            if (ProtoView.Controllers.Serial) {
                                const curSerial = ProtoView.Controllers.Serial.getCurrentProtocol();
                                if (curSerial && curSerial.id === targetProto.id) {
                                    Object.assign(curSerial, targetProto);
                                }
                            }
                        } else if (targetProto.type === 'CAN') {
                            // canStandard 锁定保持原值
                            targetProto.baudRate = Number(protoCanBaud ? protoCanBaud.value : 500000);
                        }

                        if (ProtoView.WorkspaceSync) {
                            await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(targetProto);
                        }
                        await window.dbHelper.saveProtocol(targetProto);

                        if (protocolConfigModal) protocolConfigModal.classList.remove('active');

                        await refreshProductDatalist();
                        if (typeof window.loadArincProtocolsForSelect === 'function') await window.loadArincProtocolsForSelect();
                        await loadProtocols();
                        await loadProtocolsForSelect();

                        if (targetProto.type === 'ARINC429' && typeof window.updateToolbarProtocolInfo === 'function') {
                            window.updateToolbarProtocolInfo();
                        } else if (targetProto.type === 'Serial' && typeof window.updateSerialToolbarProtocolInfo === 'function') {
                            window.updateSerialToolbarProtocolInfo();
                        }

                        showToast(`已成功保存协议「${targetProto.name}」的属性配置！`, 'success');
                    } else {
                        // ========================= 新建模式 =========================
                        let newProto = null;

                        if (protoType === 'Serial') {
                            const subTypeVal = protoSerialSubtype ? protoSerialSubtype.value : 'RS485';
                            const baudVal = Number(protoSerialBaud ? protoSerialBaud.value : 115200);
                            const dataBitsVal = Number(protoSerialDataBits ? protoSerialDataBits.value : 8);
                            const parityVal = protoSerialParity ? protoSerialParity.value : 'none';
                            const stopBitsVal = Number(protoSerialStopBits ? protoSerialStopBits.value : 1);

                            newProto = {
                                name,
                                product,
                                type: 'Serial',
                                subType: subTypeVal,
                                baudRate: baudVal,
                                dataBits: dataBitsVal,
                                parity: parityVal,
                                stopBits: stopBitsVal,
                                device,
                                period,
                                description: desc,
                                packets: [
                                    {
                                        key: 'pkt_1',
                                        name: '数据包 1',
                                        direction: 'Tx',
                                        fields: []
                                    }
                                ]
                            };

                            const id = await window.dbHelper.saveProtocol(newProto);
                            newProto.id = id;

                            if (ProtoView.WorkspaceSync) {
                                await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(newProto);
                            }

                            if (protocolConfigModal) protocolConfigModal.classList.remove('active');
                            await loadProtocols();
                            await loadProtocolsForSelect();

                            if (typeof window.switchToView === 'function') window.switchToView('serial-view');
                            if (typeof window.loadSerialProtocolIntoEditor === 'function') {
                                await window.loadSerialProtocolIntoEditor(id);
                            }
                            showToast(`已成功创建串口通信协议「${newProto.name}」并进入工作台！`, 'success');
                            return;
                        }

                        if (protoType === 'CAN') {
                            const canStd = protoCanStandard ? protoCanStandard.value : 'CAN2.0B';
                            const canBaud = Number(protoCanBaud ? protoCanBaud.value : 500000);

                            newProto = {
                                name,
                                product,
                                type: 'CAN',
                                canStandard: canStd,
                                baudRate: canBaud,
                                device,
                                direction,
                                period,
                                description: desc,
                                frames: []
                            };

                            const id = await window.dbHelper.saveProtocol(newProto);
                            newProto.id = id;

                            if (ProtoView.WorkspaceSync) {
                                await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(newProto);
                            }

                            if (protocolConfigModal) protocolConfigModal.classList.remove('active');
                            await loadProtocols();
                            await loadProtocolsForSelect();
                            showToast(`已成功创建 CAN 通信协议「${newProto.name}」！`, 'success');
                            return;
                        }

                        // 默认 ARINC 429
                        const subtype = protoArincSubtype ? protoArincSubtype.value : 'ARINC429 (HB6096)';
                        const speed = protoArincSpeed ? protoArincSpeed.value : '100kbps';
                        const parity = protoArincParity ? protoArincParity.value : 'odd';
                        const mode = protoArincMode ? protoArincMode.value : 'classic';

                        const initialPackets = [
                            {
                                key: 'pkt_1',
                                name: '数据包 1',
                                direction: 'Tx',
                                words: []
                            }
                        ];

                        newProto = {
                            name,
                            product,
                            type: 'ARINC429',
                            subType: subtype,
                            mode,
                            period,
                            device,
                            source: device,
                            speed,
                            parity,
                            description: desc,
                            packets: initialPackets,
                            words: []
                        };

                        const id = await window.dbHelper.saveProtocol(newProto);
                        newProto.id = id;

                        if (ProtoView.WorkspaceSync) {
                            await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(newProto);
                        }

                        if (protocolConfigModal) protocolConfigModal.classList.remove('active');

                        if (typeof window.switchToView === 'function') window.switchToView('arinc429-view');
                        if (typeof window.loadArincProtocolsForSelect === 'function') await window.loadArincProtocolsForSelect();
                        await loadProtocols();
                        if (typeof window.loadArincProtocolIntoEditor === 'function') await window.loadArincProtocolIntoEditor(id);

                        showToast(`已成功创建 ARINC 429 协议「${newProto.name}」并进入工作台！`, 'success');
                    }
                } catch (err) {
                    console.error("保存协议失败:", err);
                    alert("保存协议异常: " + err.message);
                }
            });
        }
    }

    // 控制器对象定义
    const ProductController = {
        loadProtocols,
        loadProtocolsForSelect,
        openProductModal,
        editProductByName,
        deleteProductByName,
        moveProtocolToProduct,
        deleteProtocol,
        openProtocolWorkbench,
        openCreate429Modal,
        openProtocolPropsModal,
        exportProtocolById,
        refreshProductDatalist,
        bindEvents: bindProductEvents
    };

    ProtoView.Controllers.Product = ProductController;
    global.ProtoView = ProtoView;

    // 向后兼容挂载到 window
    global.loadProtocols = loadProtocols;
    global.loadProtocolsForSelect = loadProtocolsForSelect;
    global.openProductModal = openProductModal;
    global.editProductByName = editProductByName;
    global.deleteProductByName = deleteProductByName;
    global.moveProtocolToProduct = moveProtocolToProduct;
    global.deleteProtocol = deleteProtocol;
    global.openProtocolWorkbench = openProtocolWorkbench;
    global.openCreate429Modal = openCreate429Modal;
    global.openCreateProtocolModal = openCreate429Modal;
    global.openProtocolPropsModal = openProtocolPropsModal;
    global.openProps429Modal = openProtocolPropsModal;
    global.editProtocolProps = openProtocolPropsModal;
    global.editProtocol = openProtocolPropsModal;
    global.exportProtocolById = exportProtocolById;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindProductEvents);
    } else {
        bindProductEvents();
    }

})(typeof window !== 'undefined' ? window : this);
