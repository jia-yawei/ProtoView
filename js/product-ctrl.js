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
    let activeBusTypeFilter = 'all'; // 'all' | 'ARINC429' | 'SERIAL' | 'CAN'
    let activeArchiveStatusFilter = 'all'; // 'all' | 'archived' | 'unarchived'
    let productSearchQuery = '';
    let sidebarProductSearchQuery = '';
    let isSidebarProdTreeCollapsed = false;
    try {
        isSidebarProdTreeCollapsed = localStorage.getItem('protoview_sidebar_prod_collapsed') === 'true';
    } catch (e) {
        isSidebarProdTreeCollapsed = false;
    }
    let collapsedProducts = new Set();
    try {
        const savedCollapsed = localStorage.getItem('protoview_collapsed_products');
        if (savedCollapsed) {
            collapsedProducts = new Set(JSON.parse(savedCollapsed));
        }
    } catch (e) {
        collapsedProducts = new Set();
    }

    // 侧边栏产品目录树折叠状态联动
    function updateSidebarProdTreeCollapseUI() {
        const header = document.getElementById('sidebar-product-header');
        const body = document.getElementById('sidebar-product-section-body');
        if (header) {
            if (isSidebarProdTreeCollapsed) {
                header.classList.add('is-collapsed');
                header.title = '点击展开产品型号列表';
            } else {
                header.classList.remove('is-collapsed');
                header.title = '点击折叠产品型号列表';
            }
        }
        if (body) {
            if (isSidebarProdTreeCollapsed) {
                body.classList.add('is-collapsed');
            } else {
                body.classList.remove('is-collapsed');
            }
        }
    }

    // 活跃会话管理器 (当前编辑/查阅的通信协议)
    const ActiveSession = {
        key: 'protoview_active_session_proto',
        set(proto) {
            if (!proto || !proto.id) return;
            try {
                const isArinc = proto.type === 'ARINC429';
                const isSerial = ['RS422', 'RS485', 'RS232', 'UART', 'Serial'].includes(proto.type);
                const mini = {
                    id: proto.id,
                    name: proto.name || '未命名通信协议',
                    type: proto.type || (isSerial ? 'Serial' : 'ARINC429'),
                    version: proto.version || 'v1.0',
                    isArchived: !!proto.isArchived,
                    hasUnarchivedChanges: !!proto.hasUnarchivedChanges
                };
                localStorage.setItem(this.key, JSON.stringify(mini));
                this.render();
            } catch (e) {
                console.warn('ActiveSession.set failed', e);
            }
        },
        get() {
            try {
                const str = localStorage.getItem(this.key);
                return str ? JSON.parse(str) : null;
            } catch (e) {
                return null;
            }
        },
        render() {
            const card = document.getElementById('sidebar-active-session');
            if (!card) return;
            const data = this.get();
            if (!data || !data.id) {
                card.style.display = 'none';
                return;
            }

            // 在协议详情查阅页 (protocol-viewer-view) 及工作台编辑页内，用户已聚焦在当前协议内部，
            // 且顶部工具栏已呈现“只读查阅模式”标识与“进入编辑工作台”入口。
            // 隐藏侧边栏底部的“当前协议”卡片，消除视觉与交互路径的双重冗余；仅在主列表 (protocol-view) 等外层视图中呈现。
            const activeView = document.querySelector('.view-section.active');
            const isInsideDetailOrWorkbench = activeView && (
                activeView.id === 'protocol-viewer-view' ||
                activeView.id === 'arinc429-view' ||
                activeView.id === 'serial-view' ||
                activeView.id === 'can-view'
            );
            if (isInsideDetailOrWorkbench) {
                card.style.display = 'none';
                return;
            }

            card.style.display = 'flex';

            const tagEl = document.getElementById('sas-type-tag');
            const titleEl = document.getElementById('sas-title');
            const verEl = document.getElementById('sas-ver');
            const statusEl = document.getElementById('sas-status');
            const btnEdit = document.getElementById('sas-btn-edit');
            const btnView = document.getElementById('sas-btn-view');

            if (tagEl) {
                const isArinc = data.type === 'ARINC429';
                const isSerial = ['RS422', 'RS485', 'RS232', 'UART', 'Serial'].includes(data.type);
                tagEl.textContent = isArinc ? '429' : (isSerial ? '串口' : 'CAN');
            }
            if (titleEl) {
                titleEl.textContent = data.name;
                titleEl.title = data.name;
            }
            if (verEl) {
                verEl.textContent = data.version || 'v1.0';
                verEl.style.cursor = 'pointer';
                verEl.title = '版本号：点击查看该协议的版本历程与快照';
                verEl.onclick = () => {
                    if (window.openProtocolVersionView) {
                        window.openProtocolVersionView(data.id);
                    }
                };
            }
            if (statusEl) {
                statusEl.style.cursor = 'pointer';
                statusEl.title = '归档状态：点击查看该协议的版本历程与快照';
                statusEl.onclick = () => {
                    if (window.openProtocolVersionView) {
                        window.openProtocolVersionView(data.id);
                    }
                };
                if (data.hasUnarchivedChanges) {
                    statusEl.textContent = '修改中';
                    statusEl.className = 'sas-status is-modified';
                } else if (data.isArchived) {
                    statusEl.textContent = '已归档';
                    statusEl.className = 'sas-status';
                } else {
                    statusEl.textContent = '未归档';
                    statusEl.className = 'sas-status';
                }
            }

            const mainClickEl = document.getElementById('sas-main-click');
            if (mainClickEl) {
                mainClickEl.onclick = () => {
                    if (window.openProtocolWorkbench) {
                        window.openProtocolWorkbench(data.id);
                    }
                };
            }

            if (btnEdit) {
                btnEdit.onclick = (e) => {
                    e.stopPropagation();
                    if (window.openProtocolWorkbench) {
                        window.openProtocolWorkbench(data.id);
                    }
                };
            }
            if (btnView) {
                btnView.onclick = (e) => {
                    e.stopPropagation();
                    if (window.openProtocolViewer) {
                        window.openProtocolViewer(data.id);
                    }
                };
            }
        }
    };
    ProtoView.ActiveSession = ActiveSession;

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
        protoArincSpeed, protoArincParity, protoArincMode, protoArincModeLockBadge,
        protoSerialBaud, protoSerialDataBits, protoSerialParity, protoSerialStopBits,
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

        protoArincSpeed = document.getElementById('proto-arinc-speed');
        protoArincParity = document.getElementById('proto-arinc-parity');
        protoArincMode = document.getElementById('proto-arinc-mode');
        protoArincModeLockBadge = document.getElementById('proto-arinc-mode-lock-badge');

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
        if (!btnToggleCollapseAll || !btnCollapseAllText || !iconCollapseAll) {
            btnToggleCollapseAll = document.getElementById('btn-toggle-collapse-all');
            iconCollapseAll = document.getElementById('icon-collapse-all');
            btnCollapseAllText = document.getElementById('btn-collapse-all-text');
            if (!btnToggleCollapseAll || !btnCollapseAllText || !iconCollapseAll) return;
        }

        const allCards = document.querySelectorAll('.product-group-card');
        // 列表为空或未渲染任何卡片时，按钮直接隐藏不占位
        if (allCards.length === 0) {
            btnToggleCollapseAll.style.display = 'none';
            btnToggleCollapseAll.classList.remove('has-expanded', 'all-collapsed');
            return;
        }

        btnToggleCollapseAll.style.display = 'inline-flex';

        const collapsedCards = document.querySelectorAll('.product-group-card.is-collapsed');
        const expandedCount = allCards.length - collapsedCards.length;

        if (expandedCount > 0) {
            // 列表有展开项：双向切换为“全部折叠”，并且高亮提示用户当前可一键收拢视口
            btnCollapseAllText.textContent = '全部折叠';
            iconCollapseAll.className = 'fa-solid fa-angles-up';
            btnToggleCollapseAll.title = `当前有 ${expandedCount} 个展开项，点击全部折叠所有产品卡片以精简视口`;
            btnToggleCollapseAll.classList.add('has-expanded');
            btnToggleCollapseAll.classList.remove('all-collapsed');
        } else {
            // 未展开任何协议卡片 (全部卡片均处于折叠状态)：双向切换为“全部展开”，消除“无效折叠”状态
            btnCollapseAllText.textContent = '全部展开';
            iconCollapseAll.className = 'fa-solid fa-angles-down';
            btnToggleCollapseAll.title = '所有产品卡片均已折叠，点击一键展开全部产品与协议列表';
            btnToggleCollapseAll.classList.remove('has-expanded');
            btnToggleCollapseAll.classList.add('all-collapsed');
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
        
        const detailMsg = related.length > 0 
            ? `检测到当前产品下有 ${related.length} 个通信协议。删除产品后，这些协议不会被删除，而是自动移入「未分类 / 通用协议」中。` 
            : '此操作将彻底删除该产品型号定义。';

        const ok = await (ProtoView.showConfirm ? ProtoView.showConfirm({
            title: '删除产品型号确认',
            icon: 'fa-trash-can',
            type: 'danger',
            message: `确定要删除产品型号「${productName}」吗？`,
            detail: detailMsg,
            confirmText: '确认删除',
            cancelText: '取消'
        }) : Promise.resolve(confirm(`确定要删除产品型号「${productName}」吗？\n\n${detailMsg}`)));

        if (ok) {
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

    // 渲染侧边栏产品型号目录树 (可折叠、可微搜索过滤、独立限高滚动)
    function renderSidebarProductTree(productMap, groupMap, totalCount) {
        window._lastProductTreeData = { productMap, groupMap, totalCount };
        updateSidebarProdTreeCollapseUI();

        const countPill = document.getElementById('sidebar-prod-total-count');
        if (countPill) {
            countPill.textContent = productMap ? productMap.size : 0;
        }

        const searchWrap = document.getElementById('sidebar-prod-search-wrap');
        const q = (sidebarProductSearchQuery || '').toLowerCase().trim();

        // 当产品型号较多 (>3 个) 或用户正在搜索时自动展示微搜索框，否则保持极简隐藏
        if (searchWrap) {
            if ((productMap && productMap.size > 3) || q) {
                searchWrap.style.display = 'flex';
            } else {
                searchWrap.style.display = 'none';
            }
        }

        const treeContainer = document.getElementById('sidebar-product-tree');
        if (!treeContainer) return;
        treeContainer.innerHTML = '';

        const sortedNames = Array.from(productMap.keys()).sort((a, b) => a.localeCompare(b, 'zh-CN'));
        const matchedNames = sortedNames.filter(name => {
            if (!q) return true;
            return name.toLowerCase().includes(q);
        });

        matchedNames.forEach(name => {
            const count = (groupMap.get(name) || []).length;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `sidebar-product-item ${activeProductFilter === name ? 'active' : ''}`;
            item.setAttribute('data-sidebar-product', name);
            item.title = `产品型号: ${name} (${count}种协议)；可拖拽协议卡片到此处快速归类`;
            item.innerHTML = `
                <i class="fa-solid fa-cube" style="font-size:11px; opacity:0.85; color:var(--accent-color);"></i>
                <span class="prod-name">${escapeHTML(name)}</span>
                <span class="sidebar-product-badge">${count}</span>
            `;

            item.addEventListener('click', () => {
                if (typeof window.switchToView === 'function') {
                    window.switchToView('protocol-view');
                }
                if (activeProductFilter === name) {
                    activeProductFilter = 'all';
                } else {
                    activeProductFilter = name;
                }
                loadProtocols();
            });

            // 拖拽归类
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('tab-drop-hover');
            });
            item.addEventListener('dragleave', () => {
                item.classList.remove('tab-drop-hover');
            });
            item.addEventListener('drop', async (e) => {
                e.preventDefault();
                item.classList.remove('tab-drop-hover');
                const protoId = Number(e.dataTransfer.getData('text/plain') || (window._draggingProtocol && window._draggingProtocol.id));
                if (protoId) {
                    await moveProtocolToProduct(protoId, name);
                }
            });

            treeContainer.appendChild(item);
        });

        // 通用未分类协议
        const UNCATEGORIZED_KEY = '__uncategorized__';
        const uncatCount = (groupMap.get(UNCATEGORIZED_KEY) || []).length;
        const matchesUncat = !q || '未分类'.includes(q) || '通用'.includes(q) || 'uncategorized'.includes(q);
        if (uncatCount > 0 && matchesUncat) {
            const uncatItem = document.createElement('button');
            uncatItem.type = 'button';
            uncatItem.className = `sidebar-product-item ${activeProductFilter === UNCATEGORIZED_KEY ? 'active' : ''}`;
            uncatItem.setAttribute('data-sidebar-product', UNCATEGORIZED_KEY);
            uncatItem.title = `通用未分类协议 (${uncatCount}种协议)；可拖拽协议卡片到此处转为通用协议`;
            uncatItem.innerHTML = `
                <i class="fa-solid fa-folder-tree" style="font-size:11px; opacity:0.85; color:var(--text-secondary);"></i>
                <span class="prod-name">未分类</span>
                <span class="sidebar-product-badge">${uncatCount}</span>
            `;
            uncatItem.addEventListener('click', () => {
                if (typeof window.switchToView === 'function') {
                    window.switchToView('protocol-view');
                }
                if (activeProductFilter === UNCATEGORIZED_KEY) {
                    activeProductFilter = 'all';
                } else {
                    activeProductFilter = UNCATEGORIZED_KEY;
                }
                loadProtocols();
            });

            uncatItem.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                uncatItem.classList.add('tab-drop-hover');
            });
            uncatItem.addEventListener('dragleave', () => {
                uncatItem.classList.remove('tab-drop-hover');
            });
            uncatItem.addEventListener('drop', async (e) => {
                e.preventDefault();
                uncatItem.classList.remove('tab-drop-hover');
                const protoId = Number(e.dataTransfer.getData('text/plain') || (window._draggingProtocol && window._draggingProtocol.id));
                if (protoId) {
                    await moveProtocolToProduct(protoId, '');
                }
            });

            treeContainer.appendChild(uncatItem);
        }

        if (matchedNames.length === 0 && (!matchesUncat || uncatCount === 0)) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'sidebar-prod-empty';
            emptyEl.innerHTML = `<i class="fa-solid fa-filter-circle-xmark"></i> <span>无匹配产品型号</span>`;
            treeContainer.appendChild(emptyEl);
        }
    }

    // 辅助识别 6 大通信接口体系中的串行家族 (RS422, RS485, RS232, UART)
    function isSerialFamily(type) {
        return ['RS422', 'RS485', 'RS232', 'UART', 'Serial'].includes(type);
    }

    function createProtocolCardElement(p) {
        const card = document.createElement('div');
        card.className = 'card glass-effect protocol-card';
        card.title = '点击进入只读查阅模式；按住可拖动至任意产品卡片或上方产品标签进行归类';
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
            if (e.target.closest('.protocol-actions') || e.target.closest('button') || e.target.closest('.card-drag-handle')) {
                return;
            }
            if (typeof window.openProtocolViewer === 'function') {
                window.openProtocolViewer(p.id || p);
            }
        });
        card.setAttribute('title', `点击直接进入查阅模式: ${p.name || '通信协议'}`);

        const productName = (p.product || '').trim();

        const verInfo = ProtoView.ArchiveManager
            ? ProtoView.ArchiveManager.getVersionDisplayInfo(p)
            : { versionText: p.version || 'v1.0', statusLabel: p.isArchived ? '已归档' : '未归档', statusClass: p.isArchived ? 'is-archived' : 'not-archived', versionPillClass: 'proto-version-pill', tooltip: '' };

        const archiveBadgeHtml = `
            <div class="card-ver-wrap" onclick="event.stopPropagation(); if(window.openProtocolVersionModal){window.openProtocolVersionModal('${p.id}');}" title="点击打开版本管理与发展历程">
                <span class="${verInfo.versionPillClass}">${escapeHTML(verInfo.versionText)}</span>
                <span class="proto-archive-badge ${verInfo.statusClass}">${verInfo.statusLabel}</span>
            </div>
        `;
        const csciStatHtml = p.softwareCI ? `<span class="pct-tag pct-tag-csci" title="关联软件配置项: ${escapeHTML(p.softwareCI)}"><i class="fa-solid fa-code-branch"></i> ${escapeHTML(p.softwareCI)}</span>` : '';

        // 云端同步状态胶囊：移至卡片右上角与版本状态并列，与底层业务/工程参数彻底剥离
        const isCloudSynced = Boolean(p._fromCloud || p._cloudKey || p._cloudUpdated || (localStorage.getItem('protoview_auth_token') && !localStorage.getItem('protoview_auth_token').startsWith('local_dev_token_')));
        const cloudBadgeHtml = `
            <span class="card-cloud-badge ${isCloudSynced ? 'is-synced' : 'is-local'}" title="${isCloudSynced ? '数据已持久化同步至 Cloudflare 分布式云端' : '数据保存在本地 IndexedDB 离线环境'}">
                <i class="fa-solid ${isCloudSynced ? 'fa-cloud' : 'fa-database'}"></i><span class="cloud-badge-text"> ${isCloudSynced ? '云端' : '本地'}</span>
            </span>
        `;

        const moreMenuHtml = `
            <div class="card-more-wrap">
                <button type="button" class="btn-card-more" onclick="event.stopPropagation(); if(window.toggleCardMoreMenu){window.toggleCardMoreMenu(this, '${p.id}');}" title="更多操作 (修改属性、复制副本、导出、移至回收站)">
                    <i class="fa-solid fa-ellipsis"></i>
                </button>
                <div class="card-more-dropdown" id="cmd-${p.id}" onclick="event.stopPropagation();">
                    <button type="button" class="cmd-item" onclick="if(window.closeAllCardMoreMenus){window.closeAllCardMoreMenus();} if(window.editProtocolProps){window.editProtocolProps('${p.id}');}">
                        <i class="fa-solid fa-sliders"></i> 修改属性
                    </button>
                    <button type="button" class="cmd-item" onclick="if(window.closeAllCardMoreMenus){window.closeAllCardMoreMenus();} if(window.cloneProtocol){window.cloneProtocol('${p.id}');}">
                        <i class="fa-solid fa-copy"></i> 复制为副本
                    </button>
                    <button type="button" class="cmd-item" onclick="if(window.closeAllCardMoreMenus){window.closeAllCardMoreMenus();} if(window.exportProtocolById){window.exportProtocolById('${p.id}');}">
                        <i class="fa-solid fa-file-export"></i> 导出规范
                    </button>
                    <div class="cmd-divider"></div>
                    <button type="button" class="cmd-item cmd-danger" onclick="if(window.closeAllCardMoreMenus){window.closeAllCardMoreMenus();} if(window.deleteProtocol){window.deleteProtocol('${p.id}');}">
                        <i class="fa-solid fa-trash-can"></i> 移至回收站
                    </button>
                </div>
            </div>
        `;

        if (p.type === 'ARINC429') {
            const packetCount = (p.packets && Array.isArray(p.packets)) ? p.packets.length : 1;
            const modeName = p.mode === 'bitstream' ? '自由 Bit 模式' : '标准字模式';
            const deviceName = p.device || p.source || '机载航电系统';
            const parityName = p.parity === 'odd' ? '奇校验' : (p.parity === 'even' ? '偶校验' : (p.parity || '奇校验'));
            const speedName = p.speed || '100kbps';
            const periodStr = `${p.period || 20}ms`;
            const arincTag = 'ARINC 429';

            card.innerHTML = `
                <div class="protocol-card-top-bar">
                    <div class="pct-left">
                        <span class="card-drag-handle" title="按住拖拽至侧边栏产品项进行归类"><i class="fa-solid fa-grip-vertical"></i></span>
                        <span class="protocol-type-badge badge-proto-arinc"><i class="fa-solid fa-plane-departure"></i> ${escapeHTML(arincTag)}</span>
                    </div>
                    <div class="pct-right">
                        ${cloudBadgeHtml}
                        ${archiveBadgeHtml}
                        ${moreMenuHtml}
                    </div>
                </div>
                <div class="protocol-card-title-box">
                    <h3 class="protocol-card-title" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h3>
                </div>
                <div class="protocol-card-tags">
                    ${productName ? `<span class="pct-tag pct-tag-product" title="所属产品: ${escapeHTML(productName)}"><i class="fa-solid fa-cube"></i> ${escapeHTML(productName)}</span>` : ''}
                    ${csciStatHtml}
                    <span class="pct-tag" title="数据包规模"><i class="fa-solid fa-box-archive"></i> ${packetCount} 个数据包</span>
                    <span class="pct-tag" title="工作模式"><i class="fa-solid fa-sliders"></i> ${modeName}</span>
                </div>
                <!-- 2列横向硬件参数对比矩阵 (传输速率、校验方式、发送周期、对端系统) -->
                <div class="protocol-specs-grid">
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-gauge-high"></i> 传输速率</span>
                        <span class="spec-v" title="${escapeHTML(speedName)}">${escapeHTML(speedName)}</span>
                    </div>
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-shield-halved"></i> 校验方式</span>
                        <span class="spec-v" title="${escapeHTML(parityName)}">${escapeHTML(parityName)}</span>
                    </div>
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-clock"></i> 发送周期</span>
                        <span class="spec-v" title="${periodStr}">${periodStr}</span>
                    </div>
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-desktop"></i> 对端系统</span>
                        <span class="spec-v" title="${escapeHTML(deviceName)}">${escapeHTML(deviceName)}</span>
                    </div>
                </div>
                <p class="protocol-card-desc" title="${escapeHTML(p.description || '机载 ARINC 429 航空总线通信协议')}">
                    ${escapeHTML(p.description || '机载 ARINC 429 航空总线通信协议')}
                </p>
                <div class="protocol-actions">
                    <button type="button" class="btn btn-sm btn-proto-workbench" onclick="window.openProtocolWorkbench && window.openProtocolWorkbench('${p.id}')" title="进入工程工作台编辑标号字与字段"><i class="fa-solid fa-pen-ruler"></i> 编辑</button>
                    <button type="button" class="btn btn-sm btn-proto-outline btn-proto-version" onclick="window.openProtocolVersionView && window.openProtocolVersionView('${p.id}')" title="查看并管理该协议的版本历程与变更对比"><i class="fa-solid fa-code-branch"></i> 版本</button>
                    <button type="button" class="btn btn-sm btn-proto-outline btn-proto-edit" onclick="window.editProtocolProps && window.editProtocolProps('${p.id}')" title="修改协议属性 (名称、产品型号、周期、速率等)"><i class="fa-solid fa-sliders"></i> 属性</button>
                </div>
            `;
        } else if (p.type === 'Serial' || isSerialFamily(p.type)) {
            const packetCount = p.packets ? p.packets.length : 0;
            const subTypeName = p.subType || (['RS422', 'RS485', 'RS232', 'UART'].includes(p.type) ? p.type : 'RS485');
            const deviceName = p.device || '传感器/执行器';
            const baudStr = (p.baudRate || 115200) + ' bps';
            const formatStr = `${p.dataBits || 8}-${(p.parity || 'none')[0].toUpperCase()}-${p.stopBits || 1}`;
            const periodStr = `${p.period || 20}ms`;

            card.innerHTML = `
                <div class="protocol-card-top-bar">
                    <div class="pct-left">
                        <span class="card-drag-handle" title="按住拖拽至侧边栏产品项进行归类"><i class="fa-solid fa-grip-vertical"></i></span>
                        <span class="protocol-type-badge badge-proto-serial"><i class="fa-solid fa-bolt" style="color: #f59e0b;"></i> ${escapeHTML(subTypeName)}</span>
                    </div>
                    <div class="pct-right">
                        ${cloudBadgeHtml}
                        ${archiveBadgeHtml}
                        ${moreMenuHtml}
                    </div>
                </div>
                <div class="protocol-card-title-box">
                    <h3 class="protocol-card-title" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h3>
                </div>
                <div class="protocol-card-tags">
                    ${productName ? `<span class="pct-tag pct-tag-product" title="所属产品: ${escapeHTML(productName)}"><i class="fa-solid fa-cube"></i> ${escapeHTML(productName)}</span>` : ''}
                    ${csciStatHtml}
                    <span class="pct-tag" title="通信数据包"><i class="fa-solid fa-box-archive"></i> ${packetCount} 个数据包</span>
                    <span class="pct-tag" title="串行标准"><i class="fa-solid fa-microchip"></i> ${escapeHTML(subTypeName)} 串口</span>
                </div>
                <!-- 2列横向硬件参数对比矩阵 (传输速率、校验方式、发送周期、对端系统) -->
                <div class="protocol-specs-grid">
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-gauge-high"></i> 传输速率</span>
                        <span class="spec-v" title="${escapeHTML(baudStr)}">${escapeHTML(baudStr)}</span>
                    </div>
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-shield-halved"></i> 校验方式</span>
                        <span class="spec-v" title="${escapeHTML(formatStr)}">${escapeHTML(formatStr)}</span>
                    </div>
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-clock"></i> 发送周期</span>
                        <span class="spec-v" title="${periodStr}">${periodStr}</span>
                    </div>
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-desktop"></i> 对端系统</span>
                        <span class="spec-v" title="${escapeHTML(deviceName)}">${escapeHTML(deviceName)}</span>
                    </div>
                </div>
                <p class="protocol-card-desc" title="${escapeHTML(p.description || `工业/航电标准 ${subTypeName} 串行通信协议`)}">
                    ${escapeHTML(p.description || `工业/航电标准 ${subTypeName} 串行通信协议`)}
                </p>
                <div class="protocol-actions">
                    <button type="button" class="btn btn-sm btn-proto-workbench" onclick="window.openProtocolWorkbench && window.openProtocolWorkbench('${p.id}')" title="进入串口工作台编辑数据包与字段"><i class="fa-solid fa-pen-ruler"></i> 编辑</button>
                    <button type="button" class="btn btn-sm btn-proto-outline btn-proto-version" onclick="window.openProtocolVersionView && window.openProtocolVersionView('${p.id}')" title="查看并管理该协议的版本历程与变更对比"><i class="fa-solid fa-code-branch"></i> 版本</button>
                    <button type="button" class="btn btn-sm btn-proto-outline btn-proto-edit" onclick="window.editProtocolProps && window.editProtocolProps('${p.id}')" title="修改协议属性 (名称、产品型号、波特率等)"><i class="fa-solid fa-sliders"></i> 属性</button>
                </div>
            `;
        } else {
            const canTag = 'CAN';
            const frameCount = p.frames ? p.frames.length : 0;
            const canBaudStr = p.baudRate ? (p.baudRate >= 1000 ? (p.baudRate / 1000) + ' kbps' : p.baudRate + ' bps') : '500 kbps';
            const canStdStr = p.canStandard ? `${p.canStandard} (CRC)` : 'CAN 2.0B (CRC)';
            const periodStr = `${p.period || 20}ms`;
            const deviceName = p.device || '整机控制单元';

            card.innerHTML = `
                <div class="protocol-card-top-bar">
                    <div class="pct-left">
                        <span class="card-drag-handle" title="按住拖拽至侧边栏产品项进行归类"><i class="fa-solid fa-grip-vertical"></i></span>
                        <span class="protocol-type-badge badge-proto-can"><i class="fa-solid fa-network-wired" style="color:#10b981;"></i> ${escapeHTML(canTag)}</span>
                    </div>
                    <div class="pct-right">
                        ${cloudBadgeHtml}
                        ${archiveBadgeHtml}
                        ${moreMenuHtml}
                    </div>
                </div>
                <div class="protocol-card-title-box">
                    <h3 class="protocol-card-title" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h3>
                </div>
                <div class="protocol-card-tags">
                    ${productName ? `<span class="pct-tag pct-tag-product" title="所属产品: ${escapeHTML(productName)}"><i class="fa-solid fa-cube"></i> ${escapeHTML(productName)}</span>` : ''}
                    ${csciStatHtml}
                    <span class="pct-tag" title="CAN 报文规模"><i class="fa-solid fa-layer-group"></i> ${frameCount} 个报文</span>
                    <span class="pct-tag" title="总线规范"><i class="fa-solid fa-sliders"></i> ${escapeHTML(p.canStandard || 'CAN 2.0B')}</span>
                </div>
                <!-- 2列横向硬件参数对比矩阵 (传输速率、校验方式、发送周期、对端系统) -->
                <div class="protocol-specs-grid">
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-gauge-high"></i> 传输速率</span>
                        <span class="spec-v" title="${escapeHTML(canBaudStr)}">${escapeHTML(canBaudStr)}</span>
                    </div>
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-shield-halved"></i> 校验方式</span>
                        <span class="spec-v" title="${escapeHTML(canStdStr)}">${escapeHTML(canStdStr)}</span>
                    </div>
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-clock"></i> 发送周期</span>
                        <span class="spec-v" title="${periodStr}">${periodStr}</span>
                    </div>
                    <div class="spec-cell">
                        <span class="spec-k"><i class="fa-solid fa-desktop"></i> 对端系统</span>
                        <span class="spec-v" title="${escapeHTML(deviceName)}">${escapeHTML(deviceName)}</span>
                    </div>
                </div>
                <p class="protocol-card-desc" title="${escapeHTML(p.description || '工业总线通信协议')}">
                    ${escapeHTML(p.description || '工业总线通信协议')}
                </p>
                <div class="protocol-actions">
                    <button type="button" class="btn btn-sm btn-proto-workbench" onclick="window.openProtocolWorkbench && window.openProtocolWorkbench('${p.id}')" title="进入工作台编辑报文与信号"><i class="fa-solid fa-pen-ruler"></i> 编辑</button>
                    <button type="button" class="btn btn-sm btn-proto-outline btn-proto-version" onclick="window.openProtocolVersionView && window.openProtocolVersionView('${p.id}')" title="查看并管理该协议的版本历程与变更对比"><i class="fa-solid fa-code-branch"></i> 版本</button>
                    <button type="button" class="btn btn-sm btn-proto-outline btn-proto-edit" onclick="window.editProtocolProps && window.editProtocolProps('${p.id}')" title="修改协议属性 (名称、产品型号、周期等)"><i class="fa-solid fa-sliders"></i> 属性</button>
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

        // 实时更新侧边栏与页面内总线协议数量徽章
        const totalCount = (protocols || []).length;
        const arincCount = (protocols || []).filter(p => p.type === 'ARINC429').length;
        const serialCount = (protocols || []).filter(p => isSerialFamily(p.type)).length;
        const canCount = (protocols || []).filter(p => p.type === 'CAN').length;

        // 侧边栏常驻「协议库」总数徽章
        const sidebarProtoBadge = document.getElementById('sidebar-proto-count-badge');
        if (sidebarProtoBadge) sidebarProtoBadge.textContent = totalCount;

        // 协议库页面顶部总线类型筛选药丸组数量与状态
        const bfCountAll = document.getElementById('bf-count-all');
        const bfCountArinc = document.getElementById('bf-count-arinc');
        const bfCountSerial = document.getElementById('bf-count-serial');
        const bfCountCan = document.getElementById('bf-count-can');

        if (bfCountAll) bfCountAll.textContent = totalCount;
        if (bfCountArinc) bfCountArinc.textContent = arincCount;
        if (bfCountSerial) bfCountSerial.textContent = serialCount;
        if (bfCountCan) bfCountCan.textContent = canCount;

        document.querySelectorAll('#main-bus-filter-group .bf-pill').forEach(pill => {
            const bType = pill.getAttribute('data-bus-type') || 'all';
            if (bType === activeBusTypeFilter) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });

        // 统计归档与未归档协议数量并更新筛选药丸组
        let archivedCount = 0;
        let unarchivedCount = 0;
        (protocols || []).forEach(p => {
            const vInfo = ProtoView.ArchiveManager ? ProtoView.ArchiveManager.getVersionDisplayInfo(p) : { isArchived: Boolean(p.isArchived) };
            if (vInfo.isArchived) {
                archivedCount++;
            } else {
                unarchivedCount++;
            }
        });

        const afCountAll = document.getElementById('af-count-all');
        const afCountArchived = document.getElementById('af-count-archived');
        const afCountUnarchived = document.getElementById('af-count-unarchived');

        if (afCountAll) afCountAll.textContent = totalCount;
        if (afCountArchived) afCountArchived.textContent = archivedCount;
        if (afCountUnarchived) afCountUnarchived.textContent = unarchivedCount;

        document.querySelectorAll('#main-archive-filter-group .af-pill').forEach(pill => {
            const aStatus = pill.getAttribute('data-archive-status') || 'all';
            if (aStatus === activeArchiveStatusFilter) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });

        // 更新侧边栏回收站数量徽章
        updateRecycleBinBadge();

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
        renderSidebarProductTree(productMap, groupMap, protocols ? protocols.length : 0);
        ActiveSession.render();

        // 总线协议类型辅助过滤函数
        function applyBusTypeFilter(list) {
            if (!list) return [];
            if (activeBusTypeFilter === 'ARINC429') {
                return list.filter(p => p.type === 'ARINC429');
            }
            if (activeBusTypeFilter === 'SERIAL') {
                return list.filter(p => isSerialFamily(p.type));
            }
            if (activeBusTypeFilter === 'CAN') {
                return list.filter(p => p.type === 'CAN');
            }
            return list;
        }

        // 归档状态辅助过滤函数 (全部 / 已归档 / 未归档)
        function applyArchiveStatusFilter(list) {
            if (!list) return [];
            if (activeArchiveStatusFilter === 'all') return list;
            return list.filter(p => {
                const vInfo = ProtoView.ArchiveManager ? ProtoView.ArchiveManager.getVersionDisplayInfo(p) : { isArchived: Boolean(p.isArchived) };
                if (activeArchiveStatusFilter === 'archived') {
                    return vInfo.isArchived;
                }
                if (activeArchiveStatusFilter === 'unarchived') {
                    return !vInfo.isArchived;
                }
                return true;
            });
        }

        if (!protocols || protocols.length === 0) {
            protocolList.innerHTML = `
                <div class="onboarding-guide-container">
                    <div class="onboarding-guide-card">
                        <div class="onboarding-header">
                            <div class="onboarding-icon-wrap">
                                <i class="fa-solid fa-layer-group"></i>
                            </div>
                            <h2 class="onboarding-title">欢迎使用 ProtoView 协议管理系统</h2>
                            <p class="onboarding-desc">集中管理航电 ARINC 429、CAN 及串口总线通信协议。检测到当前协议库为空，请选择以下快捷方式快速开启工作：</p>
                        </div>
                        <div class="onboarding-grid">
                            <!-- 卡片 1: 导入现有协议文件 -->
                            <div class="onboarding-item-card oic-card-purple">
                                <div class="oic-top">
                                    <div class="oic-icon-box oic-icon-purple">
                                        <i class="fa-solid fa-file-import"></i>
                                    </div>
                                    <div class="oic-meta">
                                        <div class="oic-title-row">
                                            <h3 class="oic-title">导入现有协议文件</h3>
                                            <span class="oic-pill oic-pill-purple">多格式支持</span>
                                        </div>
                                        <p class="oic-desc">直接导入本地 Excel、XML 规范或 JSON 协议工程，系统将自动解析数据字典、报文定义与位字段。</p>
                                    </div>
                                </div>
                                <button type="button" class="oic-btn oic-btn-purple" onclick="document.getElementById('arinc-file-input').click()">
                                    <i class="fa-solid fa-folder-open"></i> 选择协议文件
                                </button>
                            </div>

                            <!-- 卡片 2: 从标准模板新建 -->
                            <div class="onboarding-item-card oic-card-blue">
                                <div class="oic-top">
                                    <div class="oic-icon-box oic-icon-blue">
                                        <i class="fa-solid fa-cubes"></i>
                                    </div>
                                    <div class="oic-meta">
                                        <div class="oic-title-row">
                                            <h3 class="oic-title">从标准模板新建</h3>
                                            <span class="oic-pill oic-pill-blue">ARINC 429</span>
                                        </div>
                                        <p class="oic-desc">基于民用与机载航电规范快速初始化总线配置，内置标准 32-bit 字结构与高低速预设通信参数。</p>
                                    </div>
                                </div>
                                <button type="button" class="oic-btn oic-btn-blue" onclick="window.openCreate429Modal('ARINC 429 典型航电总线通信协议', '机载电子设备', 'ARINC429')">
                                    <i class="fa-solid fa-plus"></i> 新建协议模板
                                </button>
                            </div>

                            <!-- 卡片 3: 加载示例工程 (推荐) -->
                            <div class="onboarding-item-card is-featured oic-card-green">
                                <div class="oic-top">
                                    <div class="oic-icon-box oic-icon-green">
                                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                                    </div>
                                    <div class="oic-meta">
                                        <div class="oic-title-row">
                                            <h3 class="oic-title">加载示例工程</h3>
                                            <span class="oic-pill oic-pill-green">推荐上手</span>
                                        </div>
                                        <p class="oic-desc">一键体验完整航电工程：预置「机电综合管理系统」及配套的标准 ARINC 429 配电与 RS422 遥测协议。</p>
                                    </div>
                                </div>
                                <button type="button" class="oic-btn oic-btn-green" onclick="window.loadDemoProject()">
                                    <i class="fa-solid fa-rocket"></i> 一键载入示例
                                </button>
                            </div>
                        </div>
                        <div class="onboarding-footer">
                            您也可以直接 <a href="javascript:void(0)" onclick="window.openProductModal()">新建产品型号</a> 或 <a href="javascript:void(0)" onclick="window.openCreate429Modal()">创建空白通信协议</a>
                        </div>
                    </div>
                </div>
            `;
            updateCollapseAllButtonState();
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
            const busFilteredList = applyBusTypeFilter(protoList);
            const archiveFilteredList = applyArchiveStatusFilter(busFilteredList);

            const filteredProtos = filterProtocolsBySearch(archiveFilteredList, productSearchQuery);
            const isProductSelfMatch = productSearchQuery && (
                prodName.toLowerCase().includes(productSearchQuery) ||
                (prodInfo.code && prodInfo.code.toLowerCase().includes(productSearchQuery)) ||
                (prodInfo.desc && prodInfo.desc.toLowerCase().includes(productSearchQuery)) ||
                (prodInfo.softwareItems && prodInfo.softwareItems.some(s => (s.name && s.name.toLowerCase().includes(productSearchQuery)) || (s.version && s.version.toLowerCase().includes(productSearchQuery))))
            );

            // 当指定了总线类型或归档状态，且该产品下没有符合条件的协议时，跳过此卡片
            if ((activeBusTypeFilter !== 'all' || activeArchiveStatusFilter !== 'all') && archiveFilteredList.length === 0) {
                return;
            }

            if (productSearchQuery && !isProductSelfMatch && filteredProtos.length === 0) {
                return;
            }

            const protosToRender = isProductSelfMatch ? archiveFilteredList : filteredProtos;

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
                                <span class="product-proto-count-badge">${protoList.length}种协议</span>
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
                        <button type="button" class="btn-product-tool" title="在此产品「${escapeHTML(prodName)}」下新建通信协议" onclick="window.openCreate429Modal('', '${escapeHTML(prodName)}')">
                            <i class="fa-solid fa-plus"></i>
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
                        <div>该产品下暂无符合筛选条件的协议。点击右上角「+」可快速创建协议。</div>
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
            const busFilteredUncategorized = applyBusTypeFilter(uncategorizedList);
            const archiveFilteredUncategorized = applyArchiveStatusFilter(busFilteredUncategorized);
            const filteredUncategorized = filterProtocolsBySearch(archiveFilteredUncategorized, productSearchQuery);
            if ((!productSearchQuery || filteredUncategorized.length > 0) && ((activeBusTypeFilter === 'all' && activeArchiveStatusFilter === 'all') || archiveFilteredUncategorized.length > 0)) {
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
                                    <span class="product-proto-count-badge" style="background:rgba(100,116,139,0.15); color:#64748b;">${uncategorizedList.length}种协议</span>
                                    <span class="product-collapsed-tag"><i class="fa-solid fa-angles-down"></i> 已折叠 (点击展开)</span>
                                    <span class="product-drop-indicator"><i class="fa-solid fa-arrow-down-to-bracket"></i> 释放转为未分类通用</span>
                                </div>
                                <p class="product-group-desc">未指定所属产品型号的通信协议，可直接将协议拖入此处解除产品归属，或拖动至上方产品。</p>
                            </div>
                        </div>
                        <div class="product-group-right">
                            <button type="button" class="btn-product-tool" title="新建未分类通用协议" onclick="window.openCreate429Modal('', '')">
                                <i class="fa-solid fa-plus"></i>
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
                    <p style="font-size: 0.85rem; color: var(--text-secondary);">请尝试更换搜索关键字、切换总线类型或调整归档状态筛选。</p>
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

    // 移至回收站 (具备误删保护与一键撤销安全网)
    async function deleteProtocol(id) {
        const proto = await (window.dbHelper ? window.dbHelper.getProtocol(id) : null);
        const name = proto ? proto.name : '该协议';

        let confirmed = false;
        if (ProtoView.Utils && typeof ProtoView.Utils.showConfirm === 'function') {
            confirmed = await ProtoView.Utils.showConfirm({
                title: '移至回收站确认',
                icon: 'fa-trash-can',
                type: 'danger',
                message: `确定要将通信协议「${name}」移至回收站吗？`,
                detail: '协议将被移入左侧边栏「协议回收站」，主列表将不再展示此协议。如系误删，您可以随时在回收站中一键恢复其报文定义与版本历程。',
                confirmText: '移至回收站',
                cancelText: '取消'
            });
        } else if (typeof window.confirm === 'function') {
            confirmed = window.confirm(`确定要将通信协议「${name}」移至回收站吗？\n\n如系误删，可随时在左侧边栏「协议回收站」中一键恢复。`);
        } else {
            confirmed = true;
        }

        if (confirmed) {
            if (window.dbHelper && typeof window.dbHelper.moveToRecycleBin === 'function') {
                await window.dbHelper.moveToRecycleBin(proto);
            } else if (window.dbHelper && typeof window.dbHelper.deleteProtocol === 'function') {
                await window.dbHelper.deleteProtocol(id);
            }

            if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.deleteProtocolFile === 'function') {
                await ProtoView.WorkspaceSync.deleteProtocolFile(proto);
            }

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
            updateRecycleBinBadge();

            showToast(`已将协议「${name}」移至回收站。您可随时在左侧边栏回收站中恢复！`, 'info');
        }
    }

    // 更新侧边栏回收站数量徽章
    function updateRecycleBinBadge() {
        const badge = document.getElementById('sidebar-trash-count-badge');
        if (!badge) return;
        const bin = (window.dbHelper && typeof window.dbHelper.getRecycleBin === 'function') ? window.dbHelper.getRecycleBin() : [];
        const count = bin.length;
        badge.textContent = count;
        if (count > 0) {
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // 格式化删除相对时间
    function formatTimeAgo(timestamp) {
        if (!timestamp) return '刚刚';
        const diff = Date.now() - timestamp;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return '刚刚';
        if (mins < 60) return `${mins} 分钟前`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} 小时前`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days} 天前`;
        const d = new Date(timestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // 打开回收站弹窗
    function openRecycleBinModal() {
        const modal = document.getElementById('recycle-bin-modal');
        const listEl = document.getElementById('recycle-bin-list');
        const countBadge = document.getElementById('rb-modal-count-badge');
        const btnClear = document.getElementById('btn-clear-recycle-bin');
        if (!modal || !listEl) return;

        const bin = (window.dbHelper && typeof window.dbHelper.getRecycleBin === 'function') ? window.dbHelper.getRecycleBin() : [];
        if (countBadge) countBadge.textContent = `共 ${bin.length} 个已删除协议`;
        if (btnClear) btnClear.style.display = bin.length > 0 ? 'inline-flex' : 'none';

        if (bin.length === 0) {
            listEl.innerHTML = `
                <div style="text-align:center; padding:45px 20px; color:var(--text-secondary);">
                    <i class="fa-solid fa-trash-can" style="font-size:38px; opacity:0.3; margin-bottom:12px; display:block;"></i>
                    <div style="font-size:14px; font-weight:600; color:var(--text-primary); margin-bottom:4px;">回收站暂无协议</div>
                    <div style="font-size:12px;">当您在协议卡片右上角将协议移至回收站时，协议将安全保存在此处，支持随时一键恢复。</div>
                </div>
            `;
        } else {
            listEl.innerHTML = bin.map(p => {
                const isArinc = p.type === 'ARINC429';
                const isSerial = isSerialFamily(p.type);
                const typeTag = isArinc ? 'ARINC 429' : (isSerial ? (p.subType || '串口') : 'CAN');
                const iconClass = isArinc ? 'fa-plane-departure' : (isSerial ? 'fa-bolt' : 'fa-network-wired');
                const iconColor = isArinc ? '#2563eb' : (isSerial ? '#f59e0b' : '#10b981');
                const iconBg = isArinc ? 'rgba(37,99,235,0.1)' : (isSerial ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)');
                const scaleStr = isArinc ? `${(p.packets && p.packets.length) || 1} 个数据包` : (isSerial ? `${(p.packets && p.packets.length) || 0} 个数据包` : `${(p.frames && p.frames.length) || 0} 个报文`);
                const timeStr = formatTimeAgo(p._deletedAt);

                return `
                    <div class="rb-item-card" data-proto-id="${p.id}">
                        <div class="rb-item-left">
                            <div class="rb-item-icon" style="background:${iconBg}; color:${iconColor};">
                                <i class="fa-solid ${iconClass}"></i>
                            </div>
                            <div class="rb-item-meta">
                                <div class="rb-item-title-row">
                                    <h4 class="rb-item-name">${escapeHTML(p.name)}</h4>
                                    <span class="protocol-type-badge" style="font-size:10px; padding:1px 6px;">${escapeHTML(typeTag)}</span>
                                    ${p.product ? `<span class="pct-tag pct-tag-product" style="font-size:10px; padding:1px 6px;"><i class="fa-solid fa-cube"></i> ${escapeHTML(p.product)}</span>` : ''}
                                </div>
                                <div class="rb-item-details">
                                    <span><i class="fa-solid fa-layer-group"></i> ${scaleStr}</span>
                                    <span>•</span>
                                    <span><i class="fa-regular fa-clock"></i> 移入回收站: ${timeStr}</span>
                                    ${p.softwareCI ? `<span>•</span><span><i class="fa-solid fa-code-branch"></i> ${escapeHTML(p.softwareCI)}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="rb-item-actions">
                            <button type="button" class="btn btn-sm btn-primary" style="height:28px; font-size:11.5px; padding:0 12px; font-weight:600;" onclick="window.restoreProtocol && window.restoreProtocol('${p.id}');" title="将此协议完整还原到协议库">
                                <i class="fa-solid fa-rotate-left"></i> 一键恢复
                            </button>
                            <button type="button" class="btn btn-sm btn-danger-outline" style="height:28px; font-size:11.5px; padding:0 8px;" onclick="window.permanentlyDeleteProtocol && window.permanentlyDeleteProtocol('${p.id}');" title="永久删除，不可恢复">
                                <i class="fa-solid fa-fire"></i> 彻底清除
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        modal.classList.add('active');
    }

    // 恢复协议
    async function restoreProtocol(id) {
        if (!window.dbHelper || typeof window.dbHelper.restoreFromRecycleBin !== 'function') return;
        const restored = await window.dbHelper.restoreFromRecycleBin(id);
        if (restored) {
            if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud === 'function') {
                await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(restored);
            }
            await loadProtocols();
            if (typeof window.loadArincProtocolsForSelect === 'function') {
                await window.loadArincProtocolsForSelect();
            }
            updateRecycleBinBadge();
            openRecycleBinModal(); // 刷新弹窗内部列表
            showToast(`已成功恢复通信协议「${restored.name}」！`, 'success');
        }
    }

    // 彻底清除单个协议
    async function permanentlyDeleteProtocol(id) {
        const bin = (window.dbHelper && typeof window.dbHelper.getRecycleBin === 'function') ? window.dbHelper.getRecycleBin() : [];
        const numId = Number(id);
        const item = bin.find(p => p.id === id || String(p.id) === String(id) || (!isNaN(numId) && Number(p.id) === numId));
        const name = item ? item.name : '该协议';

        let confirmed = false;
        if (ProtoView.Utils && typeof ProtoView.Utils.showConfirm === 'function') {
            confirmed = await ProtoView.Utils.showConfirm({
                title: '彻底清除协议确认',
                icon: 'fa-fire',
                type: 'danger',
                message: `确定要彻底清除协议「${name}」吗？`,
                detail: '彻底清除后，该协议的全部报文、位字段和版本快照将被永久物理抹除，无法再次恢复。',
                confirmText: '彻底清除',
                cancelText: '取消'
            });
        } else if (typeof window.confirm === 'function') {
            confirmed = window.confirm(`确定要彻底清除协议「${name}」吗？\n\n此操作将永久物理抹除，无法恢复。`);
        } else {
            confirmed = true;
        }

        if (confirmed) {
            if (window.dbHelper && typeof window.dbHelper.permanentlyDeleteFromRecycleBin === 'function') {
                window.dbHelper.permanentlyDeleteFromRecycleBin(id);
            }
            updateRecycleBinBadge();
            openRecycleBinModal();
            showToast(`已彻底清除协议「${name}」`, 'info');
        }
    }

    // 清空回收站
    async function emptyRecycleBin() {
        let confirmed = false;
        if (ProtoView.Utils && typeof ProtoView.Utils.showConfirm === 'function') {
            confirmed = await ProtoView.Utils.showConfirm({
                title: '清空回收站确认',
                icon: 'fa-fire',
                type: 'danger',
                message: '确定要清空回收站中的全部协议吗？',
                detail: '此操作将不可逆地永久抹除回收站内的所有通信协议和历史快照。',
                confirmText: '清空回收站',
                cancelText: '取消'
            });
        } else if (typeof window.confirm === 'function') {
            confirmed = window.confirm('确定要清空回收站中的全部协议吗？此操作不可撤销。');
        } else {
            confirmed = true;
        }

        if (confirmed) {
            if (window.dbHelper && typeof window.dbHelper.clearRecycleBin === 'function') {
                window.dbHelper.clearRecycleBin();
            }
            updateRecycleBinBadge();
            openRecycleBinModal();
            showToast('已清空协议回收站', 'info');
        }
    }

    // 复制为新协议副本 (Clone Protocol)
    async function cloneProtocol(id) {
        const proto = await (window.dbHelper ? window.dbHelper.getProtocol(id) : null);
        if (!proto) return;
        const copy = JSON.parse(JSON.stringify(proto));
        delete copy.id;
        copy.name = `${copy.name || '通信协议'}_副本`;
        copy.version = 'v1.0';
        copy.isArchived = false;
        copy.archivedVersions = [];
        delete copy.lastArchivedVersion;
        copy.createdAt = Date.now();
        copy.updatedAt = Date.now();

        const newId = await window.dbHelper.saveProtocol(copy);
        copy.id = newId;

        if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud === 'function') {
            await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(copy);
        }

        await loadProtocols();
        if (typeof window.loadArincProtocolsForSelect === 'function') {
            await window.loadArincProtocolsForSelect();
        }
        showToast(`已成功创建协议副本「${copy.name}」！`, 'success');
    }

    // 卡片右上角 ··· 更多菜单展开/收起切换
    function toggleCardMoreMenu(btn, id) {
        const wrap = btn.closest('.card-more-wrap');
        if (!wrap) return;
        const isOpen = wrap.classList.contains('is-open');
        closeAllCardMoreMenus();
        if (!isOpen) {
            wrap.classList.add('is-open');
        }
    }

    function closeAllCardMoreMenus() {
        document.querySelectorAll('.card-more-wrap.is-open').forEach(w => w.classList.remove('is-open'));
    }

    // 全局点击空白关闭 ··· 菜单
    document.addEventListener('click', () => {
        closeAllCardMoreMenus();
    });

    // 进入只读查阅模式 (以极致可读性、位域拓扑与秒级字段速查为核心)
    async function openProtocolViewer(protoOrId) {
        let p = protoOrId;
        if (typeof protoOrId === 'number' || typeof protoOrId === 'string') {
            p = await (window.dbHelper ? window.dbHelper.getProtocol(protoOrId) : null);
        }
        if (p) {
            ActiveSession.set(p);
        }

        if (ProtoView.Controllers && ProtoView.Controllers.Viewer && typeof ProtoView.Controllers.Viewer.loadProtocolIntoViewer === 'function') {
            await ProtoView.Controllers.Viewer.loadProtocolIntoViewer(protoOrId);
        } else if (typeof global.openProtocolViewer === 'function' && global.openProtocolViewer !== openProtocolViewer) {
            await global.openProtocolViewer(protoOrId);
        } else {
            console.warn('查阅模式控制器尚未就绪');
        }
    }

    // 进入全量工作台 (以工程编辑功能为核心)
    async function openProtocolWorkbench(idOrProto) {
        const p = (idOrProto && typeof idOrProto === 'object' && idOrProto.type) ? idOrProto : await (window.dbHelper ? window.dbHelper.getProtocol(idOrProto) : null);
        if (!p) return;
        ActiveSession.set(p);

        if (p.type === 'ARINC429') {
            if (typeof window.switchToView === 'function') window.switchToView('arinc429-view');
            if (typeof window.loadArincProtocolIntoEditor === 'function') {
                await window.loadArincProtocolIntoEditor(p.id);
            }
            return;
        }

        if (p.type === 'Serial' || isSerialFamily(p.type)) {
            if (typeof window.switchToView === 'function') window.switchToView('serial-view');
            if (typeof window.loadSerialProtocolIntoEditor === 'function') {
                await window.loadSerialProtocolIntoEditor(p.id);
            }
            return;
        }

        if (p.type === 'CAN') {
            if (typeof window.switchToView === 'function') window.switchToView('can-view');
            if (typeof window.loadCanProtocolIntoEditor === 'function') {
                await window.loadCanProtocolIntoEditor(p.id);
            }
            return;
        }

        // 其它总线协议属性配置
        await openProtocolPropsModal(p);
    }

    // 辅助切换 6 大接口类型 (ARINC429, RS422, RS485, RS232, UART, CAN) 的表单字段分栏展示
    function refreshTypeSpecificSections(type) {
        initDOMElements();
        const effectiveType = type || 'ARINC429';

        const isArinc = effectiveType === 'ARINC429';
        const isSerial = isSerialFamily(effectiveType);
        const isCan = effectiveType === 'CAN';

        document.querySelectorAll('.section-type-arinc').forEach(el => el.style.display = isArinc ? '' : 'none');
        document.querySelectorAll('.section-type-serial').forEach(el => el.style.display = isSerial ? '' : 'none');
        document.querySelectorAll('.section-type-can').forEach(el => el.style.display = isCan ? '' : 'none');

        if (protoFormPeriodHint) {
            if (isArinc) {
                protoFormPeriodHint.textContent = '429 数据字通信调度基准周期 (推荐 10~100ms)';
            } else if (isSerial) {
                protoFormPeriodHint.textContent = `${effectiveType} 串行数据包通信调度基准周期 (推荐 20~1000ms)`;
            } else if (isCan) {
                protoFormPeriodHint.textContent = 'CAN 周期报文发送基准周期 (推荐 10~500ms)';
            } else {
                protoFormPeriodHint.textContent = '通信调度基准周期 (ms)';
            }
        }
    }

    // 打开统一新建协议对话框 (6 大接口类型自由自选，无冗余多级标签)
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

            // 校验并匹配 6 大接口类型之一
            const initialType = (defaultType && ['ARINC429', 'RS422', 'RS485', 'RS232', 'UART', 'CAN'].includes(defaultType))
                ? defaultType
                : (isSerialFamily(defaultType) ? 'RS485' : 'ARINC429');

            // 解除接口类型及架构锁定，新建模式下允许自由选择
            if (protoFormType) {
                protoFormType.value = initialType;
                protoFormType.disabled = false;
            }
            if (protoTypeLockBadge) protoTypeLockBadge.style.display = 'none';

            if (protoArincMode) {
                protoArincMode.value = 'classic';
                protoArincMode.disabled = false;
            }
            if (protoArincModeLockBadge) protoArincModeLockBadge.style.display = 'none';

            if (protoCanStandard) {
                protoCanStandard.value = 'CAN2.0B';
                protoCanStandard.disabled = false;
            }
            if (protoCanStandardLockBadge) protoCanStandardLockBadge.style.display = 'none';

            // 从系统全局设置读取默认值
            const sysSettings = (ProtoView.Settings && typeof ProtoView.Settings.get === 'function') ? ProtoView.Settings : null;
            const defPeriod = sysSettings ? sysSettings.get('defaultPeriod', 20) : 20;
            const defSpeed = sysSettings ? sysSettings.get('defaultArincSpeed', '100kbps') : '100kbps';
            const defParity = sysSettings ? sysSettings.get('defaultArincParity', 'odd') : 'odd';
            const defBaud = sysSettings ? sysSettings.get('defaultSerialBaud', '115200') : '115200';
            const namingTpl = sysSettings ? sysSettings.get('namingTemplate', '{product}_{bus}_{type}通信协议') : '';

            // 默认协议名称根据选定的接口精准预设 (优先应用系统命名模板)
            if (protoFormName) {
                if (defaultName) {
                    protoFormName.value = defaultName;
                } else if (namingTpl && targetProduct) {
                    const devName = targetProduct ? `${targetProduct}` : '机载';
                    protoFormName.value = namingTpl
                        .replace(/\{product\}/gi, targetProduct)
                        .replace(/\{bus\}/gi, initialType)
                        .replace(/\{type\}/gi, devName);
                } else if (isSerialFamily(initialType)) {
                    protoFormName.value = `新建 ${initialType} 串行通信协议`;
                } else if (initialType === 'CAN') {
                    protoFormName.value = '新建 CAN 报文通信协议';
                } else {
                    protoFormName.value = '新建 ARINC429 通信协议';
                }
            }

            if (protoFormProduct) protoFormProduct.value = targetProduct || '';
            if (protoFormDevice) {
                protoFormDevice.value = targetProduct ? `${targetProduct}系统` : '';
            }
            if (protoFormPeriod) protoFormPeriod.value = defPeriod;

            // ARINC 默认值
            if (protoArincSpeed) protoArincSpeed.value = defSpeed;
            if (protoArincParity) protoArincParity.value = defParity;

            // 串口默认值
            if (protoSerialBaud) protoSerialBaud.value = String(defBaud);
            if (protoSerialDataBits) protoSerialDataBits.value = '8';
            if (protoSerialParity) protoSerialParity.value = 'none';
            if (protoSerialStopBits) protoSerialStopBits.value = '1';

            // CAN 默认值
            if (protoCanBaud) protoCanBaud.value = '500000';

            if (protoFormDesc) protoFormDesc.value = '';
            if (protoFormSummaryBox) protoFormSummaryBox.style.display = 'none';

            refreshTypeSpecificSections(initialType);
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

            // 精准映射到 6 大通信接口之一 (ARINC429, RS422, RS485, RS232, UART, CAN)
            let displayType = 'ARINC429';
            if (p.type === 'ARINC429') {
                displayType = 'ARINC429';
            } else if (p.type === 'CAN') {
                displayType = 'CAN';
            } else if (p.type === 'Serial' || isSerialFamily(p.type)) {
                displayType = (p.subType && ['RS422', 'RS485', 'RS232', 'UART'].includes(p.subType))
                    ? p.subType
                    : (['RS422', 'RS485', 'RS232', 'UART'].includes(p.type) ? p.type : 'RS485');
            }

            // 切换为编辑模式
            if (protoFormMode) protoFormMode.value = 'edit';
            if (protoFormId) protoFormId.value = p.id || '';
            if (protoFormLockedType) protoFormLockedType.value = displayType;

            if (protoModalTitle) {
                protoModalTitle.innerHTML = `<i class="fa-solid fa-sliders" style="color:var(--accent-color);"></i> 协议属性配置 [${escapeHTML(p.name || '通信协议')}]`;
            }
            if (btnProtoSubmitText) {
                btnProtoSubmitText.textContent = '保存属性修改';
            }

            // 核心要求：编辑协议时锁死协议接口类型及底层架构参数，绝不允许随意更改
            if (protoFormType) {
                protoFormType.value = displayType;
                protoFormType.disabled = true;
            }
            if (protoTypeLockBadge) protoTypeLockBadge.style.display = 'inline-flex';

            if (protoArincMode) {
                protoArincMode.value = p.mode || 'classic';
                protoArincMode.disabled = true;
            }
            if (protoArincModeLockBadge) protoArincModeLockBadge.style.display = 'inline-flex';

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

            if (p.type === 'ARINC429') {
                if (protoArincSpeed) protoArincSpeed.value = p.speed || '100kbps';
                if (protoArincParity) protoArincParity.value = p.parity || 'odd';
            } else if (p.type === 'Serial' || isSerialFamily(p.type)) {
                if (protoSerialBaud) protoSerialBaud.value = p.baudRate || 115200;
                if (protoSerialDataBits) protoSerialDataBits.value = p.dataBits || 8;
                if (protoSerialParity) protoSerialParity.value = p.parity || 'none';
                if (protoSerialStopBits) protoSerialStopBits.value = p.stopBits || 1;
            } else if (p.type === 'CAN') {
                if (protoCanBaud) protoCanBaud.value = p.baudRate || 500000;
            }

            if (protoFormDesc) protoFormDesc.value = p.description || '';

            const protoFormLifecycle = document.getElementById('proto-form-lifecycle');
            const protoFormCsci = document.getElementById('proto-form-csci');
            if (protoFormLifecycle) protoFormLifecycle.value = p.lifecycleStatus || 'draft';
            if (protoFormCsci) protoFormCsci.value = p.softwareCI || '';

            // 摘要统计盒
            if (protoFormSummaryBox) {
                protoFormSummaryBox.style.display = 'flex';
                if (protoSummaryIdVal) protoSummaryIdVal.textContent = p.id ? `#${p.id}` : '(新)';
                if (protoSummaryCountLabel && protoSummaryCountVal) {
                    if (p.type === 'ARINC429') {
                        protoSummaryCountLabel.textContent = '标号字数量';
                        protoSummaryCountVal.textContent = `${p.words ? p.words.length : 0} 个标号字`;
                    } else if (p.type === 'Serial' || isSerialFamily(p.type)) {
                        protoSummaryCountLabel.textContent = '数据包数量';
                        protoSummaryCountVal.textContent = `${p.packets ? p.packets.length : 0} 个数据包`;
                    } else {
                        protoSummaryCountLabel.textContent = '报文数量';
                        protoSummaryCountVal.textContent = `${p.frames ? p.frames.length : 0} 个报文`;
                    }
                }
            }

            refreshTypeSpecificSections(displayType);
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

    // 根据指定协议ID呼出统一导出中心 (全视角统一支持 JSON、PDF、Markdown 与 HTML)
    async function exportProtocolById(id) {
        if (typeof window.openProtocolExportModal === 'function') {
            await window.openProtocolExportModal(id);
            return;
        }
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
        updateCollapseAllButtonState();

        // 侧边栏常驻「协议库」导航项点击
        const navBusAll = document.getElementById('nav-bus-all');
        if (navBusAll) {
            navBusAll.addEventListener('click', (e) => {
                e.preventDefault();
                activeBusTypeFilter = 'all';
                document.querySelectorAll('#sidebar-nav-menu .nav-item').forEach(b => b.classList.remove('active'));
                navBusAll.classList.add('active');
                if (typeof window.switchToView === 'function') {
                    window.switchToView('protocol-view');
                }
                loadProtocols();
            });
        }

        // 协议库页面级总线协议类型快速筛选药丸组
        const bfPills = document.querySelectorAll('#main-bus-filter-group .bf-pill');
        bfPills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.preventDefault();
                const bType = pill.getAttribute('data-bus-type') || 'all';
                activeBusTypeFilter = bType;
                bfPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                loadProtocols();
            });
        });

        // 协议库页面级归档状态快速筛选药丸组 (全部 / 已归档 / 未归档)
        const afPills = document.querySelectorAll('#main-archive-filter-group .af-pill');
        afPills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.preventDefault();
                const aStatus = pill.getAttribute('data-archive-status') || 'all';
                activeArchiveStatusFilter = aStatus;
                afPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                loadProtocols();
            });
        });

        // 回收站弹窗关闭按钮绑定
        const btnCloseRecycleBin = document.getElementById('btn-close-recycle-bin');
        if (btnCloseRecycleBin) {
            btnCloseRecycleBin.addEventListener('click', () => {
                const modal = document.getElementById('recycle-bin-modal');
                if (modal) modal.classList.remove('active');
            });
        }
        const btnCloseRecycleBinFooter = document.getElementById('btn-close-recycle-bin-footer');
        if (btnCloseRecycleBinFooter) {
            btnCloseRecycleBinFooter.addEventListener('click', () => {
                const modal = document.getElementById('recycle-bin-modal');
                if (modal) modal.classList.remove('active');
            });
        }

        if (btnToggleCollapseAll) {
            btnToggleCollapseAll.addEventListener('click', () => {
                const allCards = document.querySelectorAll('.product-group-card');
                if (allCards.length === 0) return;
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

        // 侧边栏产品目录树折叠/展开与微搜索过滤
        const sidebarProdHeader = document.getElementById('sidebar-product-header');
        if (sidebarProdHeader) {
            sidebarProdHeader.addEventListener('click', () => {
                isSidebarProdTreeCollapsed = !isSidebarProdTreeCollapsed;
                try {
                    localStorage.setItem('protoview_sidebar_prod_collapsed', isSidebarProdTreeCollapsed ? 'true' : 'false');
                } catch (e) {}
                updateSidebarProdTreeCollapseUI();
            });
        }

        const sidebarProdSearch = document.getElementById('sidebar-product-search');
        const btnClearSidebarProdSearch = document.getElementById('btn-clear-sidebar-prod-search');
        if (sidebarProdSearch) {
            sidebarProdSearch.addEventListener('input', (e) => {
                sidebarProductSearchQuery = e.target.value.trim().toLowerCase();
                if (btnClearSidebarProdSearch) {
                    btnClearSidebarProdSearch.style.display = sidebarProductSearchQuery ? 'inline-flex' : 'none';
                }
                if (window._lastProductTreeData) {
                    renderSidebarProductTree(window._lastProductTreeData.productMap, window._lastProductTreeData.groupMap, window._lastProductTreeData.totalCount);
                }
            });

            sidebarProdSearch.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    sidebarProdSearch.value = '';
                    sidebarProductSearchQuery = '';
                    if (btnClearSidebarProdSearch) btnClearSidebarProdSearch.style.display = 'none';
                    if (window._lastProductTreeData) {
                        renderSidebarProductTree(window._lastProductTreeData.productMap, window._lastProductTreeData.groupMap, window._lastProductTreeData.totalCount);
                    }
                }
            });
        }

        if (btnClearSidebarProdSearch) {
            btnClearSidebarProdSearch.addEventListener('click', (e) => {
                e.stopPropagation();
                if (sidebarProdSearch) {
                    sidebarProdSearch.value = '';
                    sidebarProductSearchQuery = '';
                    btnClearSidebarProdSearch.style.display = 'none';
                    if (window._lastProductTreeData) {
                        renderSidebarProductTree(window._lastProductTreeData.productMap, window._lastProductTreeData.groupMap, window._lastProductTreeData.totalCount);
                    }
                    sidebarProdSearch.focus();
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
                    if (!curName || curName.includes('ARINC') || curName.includes('串行通信协议') || curName.includes('串口通信协议') || curName.includes('CAN 报文通信协议')) {
                        if (isSerialFamily(newType)) {
                            protoFormName.value = `新建 ${newType} 串行通信协议`;
                        } else if (newType === 'CAN') {
                            protoFormName.value = '新建 CAN 报文通信协议';
                        } else {
                            protoFormName.value = '新建 ARINC429 通信协议';
                        }
                    }
                }
            });
        }

        // 统一协议配置表单提交处理 (新建与编辑统一流，适配 6 大通信接口)
        if (protocolConfigForm) {
            protocolConfigForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const isEdit = (protoFormMode && protoFormMode.value === 'edit');
                    const targetId = Number(protoFormId ? protoFormId.value : 0);

                    // 获取总线类型（若被锁定 disabled，则从 lockedType 恢复）
                    let selectedType = protoFormLockedType && protoFormLockedType.value ? protoFormLockedType.value : (protoFormType ? protoFormType.value : 'ARINC429');
                    if (!isEdit && protoFormType) {
                        selectedType = protoFormType.value || 'ARINC429';
                    }

                    const name = (protoFormName ? protoFormName.value.trim() : '') || (isSerialFamily(selectedType) ? `未命名${selectedType}协议` : (selectedType === 'CAN' ? '未命名CAN协议' : '未命名429协议'));
                    const product = (protoFormProduct ? protoFormProduct.value.trim() : '');
                    if (product) {
                        await window.dbHelper.saveProduct({ name: product });
                        if (ProtoView.WorkspaceSync && ProtoView.WorkspaceSync.syncProductsToCloud) {
                            await ProtoView.WorkspaceSync.syncProductsToCloud();
                        }
                    }
                    const device = (protoFormDevice ? protoFormDevice.value.trim() : '') || (product ? `${product}系统` : '机载航电系统');
                    const period = parseInt(protoFormPeriod ? protoFormPeriod.value : 20) || 20;
                    const desc = (protoFormDesc ? protoFormDesc.value.trim() : '') || `${selectedType} 通信总线协议`;

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

                        const protoFormLifecycle = document.getElementById('proto-form-lifecycle');
                        const protoFormCsci = document.getElementById('proto-form-csci');
                        if (protoFormLifecycle) targetProto.lifecycleStatus = protoFormLifecycle.value;
                        if (protoFormCsci) targetProto.softwareCI = protoFormCsci.value.trim();

                        if (targetProto.type === 'ARINC429') {
                            targetProto.subType = 'ARINC429';
                            targetProto.speed = protoArincSpeed ? protoArincSpeed.value : '100kbps';
                            targetProto.parity = protoArincParity ? protoArincParity.value : 'odd';

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
                        } else if (targetProto.type === 'Serial' || isSerialFamily(targetProto.type)) {
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
                            targetProto.baudRate = Number(protoCanBaud ? protoCanBaud.value : 500000);
                        }

                        if (ProtoView.ArchiveManager) {
                            ProtoView.ArchiveManager.markProtocolModified(targetProto);
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
                        } else if ((targetProto.type === 'Serial' || isSerialFamily(targetProto.type)) && typeof window.updateSerialToolbarProtocolInfo === 'function') {
                            window.updateSerialToolbarProtocolInfo();
                        }

                        showToast(`已成功保存协议「${targetProto.name}」的属性配置！`, 'success');
                    } else {
                        // ========================= 新建模式 =========================
                        let newProto = null;

                        if (isSerialFamily(selectedType)) {
                            const subTypeVal = selectedType === 'Serial' ? 'RS485' : selectedType;
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

                            const protoFormLifecycle = document.getElementById('proto-form-lifecycle');
                            const protoFormCsci = document.getElementById('proto-form-csci');
                            if (protoFormLifecycle) newProto.lifecycleStatus = protoFormLifecycle.value;
                            if (protoFormCsci) newProto.softwareCI = protoFormCsci.value.trim();

                            if (ProtoView.ArchiveManager && typeof ProtoView.ArchiveManager.ensureProtocolVersion === 'function') {
                                ProtoView.ArchiveManager.ensureProtocolVersion(newProto);
                            } else if (ProtoView.VersionManager && typeof ProtoView.VersionManager.ensureProtocolVersion === 'function') {
                                ProtoView.VersionManager.ensureProtocolVersion(newProto);
                            }

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
                            showToast(`已成功创建 ${subTypeVal} 串行通信协议「${newProto.name}」并进入工作台！`, 'success');
                            return;
                        }

                        if (selectedType === 'CAN') {
                            const canStd = protoCanStandard ? protoCanStandard.value : 'CAN2.0B';
                            const canBaud = Number(protoCanBaud ? protoCanBaud.value : 500000);

                            newProto = {
                                name,
                                product,
                                type: 'CAN',
                                subType: 'CAN',
                                canStandard: canStd,
                                baudRate: canBaud,
                                device,
                                period,
                                description: desc,
                                frames: []
                            };

                            const protoFormLifecycle = document.getElementById('proto-form-lifecycle');
                            const protoFormCsci = document.getElementById('proto-form-csci');
                            if (protoFormLifecycle) newProto.lifecycleStatus = protoFormLifecycle.value;
                            if (protoFormCsci) newProto.softwareCI = protoFormCsci.value.trim();

                            if (ProtoView.ArchiveManager && typeof ProtoView.ArchiveManager.ensureProtocolVersion === 'function') {
                                ProtoView.ArchiveManager.ensureProtocolVersion(newProto);
                            } else if (ProtoView.VersionManager && typeof ProtoView.VersionManager.ensureProtocolVersion === 'function') {
                                ProtoView.VersionManager.ensureProtocolVersion(newProto);
                            }

                            const id = await window.dbHelper.saveProtocol(newProto);
                            newProto.id = id;

                            if (ProtoView.WorkspaceSync) {
                                await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(newProto);
                            }

                            if (protocolConfigModal) protocolConfigModal.classList.remove('active');
                            await loadProtocols();
                            await loadProtocolsForSelect();

                            if (typeof window.switchToView === 'function') window.switchToView('can-view');
                            if (typeof window.loadCanProtocolIntoEditor === 'function') {
                                await window.loadCanProtocolIntoEditor(id);
                            }
                            showToast(`已成功创建 CAN 通信协议「${newProto.name}」并进入工作台！`, 'success');
                            return;
                        }

                        // 默认 ARINC 429
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
                            subType: 'ARINC429',
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

                        const protoFormLifecycle = document.getElementById('proto-form-lifecycle');
                        const protoFormCsci = document.getElementById('proto-form-csci');
                        if (protoFormLifecycle) newProto.lifecycleStatus = protoFormLifecycle.value;
                        if (protoFormCsci) newProto.softwareCI = protoFormCsci.value.trim();

                        if (ProtoView.ArchiveManager && typeof ProtoView.ArchiveManager.ensureProtocolVersion === 'function') {
                            ProtoView.ArchiveManager.ensureProtocolVersion(newProto);
                        } else if (ProtoView.VersionManager && typeof ProtoView.VersionManager.ensureProtocolVersion === 'function') {
                            ProtoView.VersionManager.ensureProtocolVersion(newProto);
                        }

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

                        showToast(`已成功创建 ARINC429 通信协议「${newProto.name}」并进入工作台！`, 'success');
                    }
                } catch (err) {
                    console.error("保存协议失败:", err);
                    alert("保存协议异常: " + err.message);
                }
            });
        }
    }

    // 加载官方航电/工业示例工程 (包含机电综合管理系统、标准 429 配电协议与 RS422 遥测协议)
    async function loadDemoProject() {
        try {
            showToast('正在加载示例工程与航电规范数据...', 'info');

            // 1. 预置产品型号与软件配置项
            const demoProduct = {
                name: '机电综合管理系统',
                code: 'EMS-4000',
                desc: '机载机电与综合航电管理子系统，负责全机主电源监控、配电管理与外部总线数据交互',
                softwareItems: [
                    { name: '电源监控核心固件 (PM-CSCI)', version: 'v2.1.0' },
                    { name: '航电通信管理软件 (CM-CSCI)', version: 'v1.4.2' }
                ]
            };
            if (window.dbHelper && typeof window.dbHelper.saveProduct === 'function') {
                await window.dbHelper.saveProduct(demoProduct);
            }

            // 2. 预置标准 ARINC 429 通信协议
            const demo429Words = [
                {
                    id: 'w_1',
                    name: '直流母线状态字 (Label 101)',
                    label: '101',
                    sdi: '00',
                    ssm: 'NO',
                    editMode: 'bitstream',
                    period: 100,
                    signals: [
                        { name: '母线A工作电压', startBit: 11, bitCount: 10, dataType: 'u16', resolution: '0.1', unit: 'V', min: 0, max: 50, description: '28V 直流母线实时采样电压' },
                        { name: '过压保护告警', startBit: 21, bitCount: 1, dataType: 'bool', unit: '', description: '0-正常, 1-过压告警' },
                        { name: '欠压告警状态', startBit: 22, bitCount: 1, dataType: 'bool', unit: '', description: '0-正常, 1-欠压告警' },
                        { name: '配电断路器跳闸', startBit: 23, bitCount: 1, dataType: 'bool', unit: '', description: '0-正常闭合, 1-跳闸断开' },
                        { name: '备用通道就绪', startBit: 24, bitCount: 1, dataType: 'bool', unit: '', description: '0-未就绪, 1-正常就绪' }
                    ]
                },
                {
                    id: 'w_2',
                    name: '主继电器状态字 (Label 102)',
                    label: '102',
                    sdi: '00',
                    ssm: 'NO',
                    editMode: 'bitstream',
                    period: 200,
                    signals: [
                        { name: '发电机接触器', startBit: 11, bitCount: 1, dataType: 'bool', unit: '', description: '0-断开, 1-吸合' },
                        { name: '外接航电设备', startBit: 12, bitCount: 1, dataType: 'bool', unit: '', description: '0-下电, 1-已供电' },
                        { name: '负载分配百分比', startBit: 13, bitCount: 8, dataType: 'u8', resolution: '1', unit: '%', min: 0, max: 100, description: '主回路当前负荷占比' }
                    ]
                }
            ];

            const demo429Packet2Words = [
                {
                    id: 'w_3',
                    name: '配电控制指令字 (Label 103)',
                    label: '103',
                    sdi: '01',
                    ssm: 'NO',
                    editMode: 'bitstream',
                    period: 50,
                    direction: 'Rx',
                    signals: [
                        { name: '急停跳闸指令', startBit: 11, bitCount: 1, dataType: 'bool', unit: '', description: '0-解除, 1-紧急跳闸' },
                        { name: '工作模式设定', startBit: 12, bitCount: 3, dataType: 'u8', unit: '', min: 0, max: 7, description: '1-地面, 2-飞行, 3-应急' },
                        { name: '自动重切允许', startBit: 15, bitCount: 1, dataType: 'bool', unit: '', description: '0-禁止, 1-允许' }
                    ]
                }
            ];

            const demo429 = {
                name: '左28V配电盒429通信协议',
                product: '机电综合管理系统',
                softwareCI: '电源监控核心固件 (PM-CSCI)',
                type: 'ARINC429',
                subType: 'ARINC429',
                mode: 'bitstream',
                period: 200,
                device: '左28V配电管理终端',
                source: '左28V配电管理终端',
                speed: '100kbps',
                parity: 'odd',
                description: '机载配电盒 ARINC 429 高速总线通信规范，包含母线电压与继电器状态标号',
                lifecycleStatus: 'approved',
                packets: [
                    {
                        key: 'pkt_1',
                        name: '主遥测发送包',
                        direction: 'Tx',
                        period: 200,
                        words: demo429Words
                    },
                    {
                        key: 'pkt_2',
                        name: '配电控制指令包',
                        direction: 'Rx',
                        period: 50,
                        words: demo429Packet2Words
                    }
                ],
                words: demo429Words
            };

            // 预置生动的 Git 风格版本发展历程 (v1.0 -> v1.1 -> v1.2 工作副本)
            const snapV10 = JSON.parse(JSON.stringify(demo429));
            snapV10.version = 'v1.0';
            snapV10.packets = [snapV10.packets[0]];
            if (snapV10.packets[0].words && snapV10.packets[0].words[0] && snapV10.packets[0].words[0].signals && snapV10.packets[0].words[0].signals[0]) {
                snapV10.packets[0].words[0].signals[0].resolution = '0.1';
            }

            const snapV11 = JSON.parse(JSON.stringify(demo429));
            snapV11.version = 'v1.1';
            if (snapV11.packets[0].words && snapV11.packets[0].words[0] && snapV11.packets[0].words[0].signals && snapV11.packets[0].words[0].signals[0]) {
                snapV11.packets[0].words[0].signals[0].resolution = '0.01';
            }

            demo429.version = 'v1.2';
            demo429.lastArchivedVersion = 'v1.1';
            demo429.isArchived = false;
            demo429.hasUnarchivedChanges = true;
            demo429.archivedVersions = [
                {
                    version: 'v1.1',
                    archivedAt: Date.now() - 2 * 86400 * 1000,
                    author: '张工 (系统主管)',
                    comment: '升级为双包结构：新增配电控制指令包 (Rx, 50ms) 并优化母线电压分辨率至 0.01',
                    summary: [
                        '新增数据包“配电控制指令包” (Rx, 周期 50ms)',
                        '“母线A工作电压”分辨率由 0.1 改为 0.01',
                        '新增“急停跳闸指令”、“工作模式设定”等控制字段'
                    ],
                    data: snapV11
                },
                {
                    version: 'v1.0',
                    archivedAt: Date.now() - 7 * 86400 * 1000,
                    author: '李工 (航电架构师)',
                    comment: '初始正式基准版本：包含主遥测单包及429标号字定义',
                    summary: [
                        '初建协议，定义电气规范与 100kbps 速率',
                        '定义标号字 101₈、102₈ 及母线监测字段'
                    ],
                    data: snapV10
                }
            ];

            if (ProtoView.VersionManager) {
                ProtoView.VersionManager.ensureProtocolVersion(demo429);
            }
            if (window.dbHelper && typeof window.dbHelper.saveProtocol === 'function') {
                const id429 = await window.dbHelper.saveProtocol(demo429);
                demo429.id = id429;
            }
            if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud === 'function') {
                await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(demo429);
            }

            // 3. 预置 RS422 串行遥测协议
            const demoSerial = {
                name: '机电综合遥测通信协议',
                product: '机电综合管理系统',
                softwareCI: '航电通信管理软件 (CM-CSCI)',
                type: 'Serial',
                subType: 'RS422',
                baudRate: 115200,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                device: '机电遥测前端',
                period: 50,
                description: '高速双工 RS422 串行遥测数据交互协议，支持校验与传感器全量回传',
                lifecycleStatus: 'active',
                packets: [
                    {
                        key: 'pkt_1',
                        name: '遥测状态帧 (Frame 01)',
                        direction: 'Tx',
                        fields: [
                            { name: '帧头 (Sync)', length: 2, dataType: 'hex', defaultValue: 'EB90', description: '同步字 0xEB90' },
                            { name: '帧计数', length: 2, dataType: 'u16', defaultValue: '0', description: '递增帧计数器' },
                            { name: '设备工作温度', length: 2, dataType: 'i16', unit: '℃', resolution: '0.1', description: '板载环境温度' },
                            { name: '状态标识字', length: 1, dataType: 'u8', description: '系统综合BIT自检状态' },
                            { name: '校验和 (Checksum)', length: 1, dataType: 'checksum', description: '低字节和校验' }
                        ]
                    }
                ]
            };

            // 预置生动的 Git 风格版本发展历程 (v1.0 -> v1.1)
            const snapSerialV10 = JSON.parse(JSON.stringify(demoSerial));
            snapSerialV10.version = 'v1.0';
            snapSerialV10.baudRate = 9600;

            demoSerial.version = 'v1.1';
            demoSerial.lastArchivedVersion = 'v1.1';
            demoSerial.isArchived = true;
            demoSerial.hasUnarchivedChanges = false;
            demoSerial.archivedVersions = [
                {
                    version: 'v1.1',
                    archivedAt: Date.now() - 3 * 86400 * 1000,
                    author: '陈工 (固件工程师)',
                    comment: '提高串口通信速率至 115200 bps 并增加板载工作温度监控字段',
                    summary: [
                        '波特率由 9600 bps 提升至 115200 bps',
                        '新增 2 字节温度遥测字段与校验和'
                    ],
                    data: JSON.parse(JSON.stringify(demoSerial))
                },
                {
                    version: 'v1.0',
                    archivedAt: Date.now() - 10 * 86400 * 1000,
                    author: '王工 (硬件架构师)',
                    comment: '初始制定机电遥测串行总线协议规范',
                    summary: [
                        '初建 RS422 总线协议，定义 EB90 同步头与帧计数'
                    ],
                    data: snapSerialV10
                }
            ];

            if (ProtoView.VersionManager) {
                ProtoView.VersionManager.ensureProtocolVersion(demoSerial);
            }
            if (window.dbHelper && typeof window.dbHelper.saveProtocol === 'function') {
                const idSerial = await window.dbHelper.saveProtocol(demoSerial);
                demoSerial.id = idSerial;
            }
            if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud === 'function') {
                await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(demoSerial);
            }

            // 3. 预置标准 CAN 2.0B / J1939 动力与状态报文示例协议
            const demoCan = {
                name: '机电综合动力与发动机CAN通信协议',
                product: '机电综合管理系统',
                type: 'CAN',
                subType: 'CAN',
                canStandard: 'CAN2.0B',
                baudRate: 500000,
                device: '动力电驱与发动机控制器 (EEC/FADEC)',
                period: 20,
                description: '标准 SAE J1939 动力发动机电子控制单元 (EEC1) 与动力电池管理周期报文协议',
                lifecycleStatus: 'active',
                frames: [
                    {
                        id: '0x0CF00400',
                        isExtended: true,
                        name: '电子发动机控制器1 (EEC1)',
                        dlc: 8,
                        period: 20,
                        direction: 'Tx',
                        transmitter: 'EEC_ECU',
                        signals: [
                            {
                                name: '发动机转速高8位 (Engine Speed H)',
                                key: 'EngineSpeedH',
                                startBit: 24,
                                bitLength: 8,
                                byteOrder: 'intel',
                                dataType: 'u8',
                                factor: 32,
                                offset: 0,
                                min: 0,
                                max: 8160,
                                unit: 'rpm',
                                description: '发动机转速采样高8位'
                            },
                            {
                                name: '发动机运行标志 (Engine Run)',
                                key: 'EngineRun',
                                startBit: 32,
                                bitLength: 1,
                                byteOrder: 'intel',
                                dataType: 'bool',
                                factor: 1,
                                offset: 0,
                                min: 0,
                                max: 1,
                                unit: '',
                                description: '0-停机, 1-运行中'
                            },
                            {
                                name: '实际发动机扭矩百分比 (Actual Torque)',
                                key: 'ActualTorque',
                                startBit: 16,
                                bitLength: 8,
                                byteOrder: 'intel',
                                dataType: 'u8',
                                factor: 1,
                                offset: -125,
                                min: -125,
                                max: 125,
                                unit: '%',
                                description: '当前发动机实际输出扭矩百分比'
                            },
                            {
                                name: '发动机扭矩模式 (Engine Torque Mode)',
                                key: 'EngTorqueMode',
                                startBit: 0,
                                bitLength: 4,
                                byteOrder: 'intel',
                                dataType: 'u8',
                                factor: 1,
                                offset: 0,
                                min: 0,
                                max: 15,
                                unit: '',
                                description: '当前扭矩控制模式状态',
                                choices: {
                                    '0': '低怠速控制 (Low Idle)',
                                    '1': '加速踏板控制 (Pedal)',
                                    '2': '巡航控制 (Cruise)',
                                    '3': 'PTO 动力输出控制'
                                }
                            },
                            {
                                name: '启动机状态 (Starter Status)',
                                key: 'StarterStatus',
                                startBit: 48,
                                bitLength: 4,
                                byteOrder: 'intel',
                                dataType: 'u8',
                                factor: 1,
                                offset: 0,
                                min: 0,
                                max: 15,
                                unit: '',
                                description: '起动机当前啮合与启动状态',
                                choices: {
                                    '0': '启动机未啮合 (Start Not Initiated)',
                                    '1': '启动机啮合中 (Starter Active)',
                                    '2': '发动机已点火成功 (Engine Cranked)',
                                    '3': '启动报错 (Starter Error)'
                                }
                            }
                        ]
                    },
                    {
                        id: '0x180',
                        isExtended: false,
                        name: '高压配电与电池状态 (BMS_Status)',
                        dlc: 8,
                        period: 50,
                        direction: 'Tx',
                        transmitter: 'BMS_Master',
                        signals: [
                            {
                                name: '动力母线总电压 (Pack Voltage)',
                                key: 'PackVoltage',
                                startBit: 0,
                                bitLength: 8,
                                byteOrder: 'intel',
                                dataType: 'u8',
                                factor: 2,
                                offset: 0,
                                min: 0,
                                max: 510,
                                unit: 'V',
                                description: '动力电池包高压母线总电压'
                            },
                            {
                                name: '母线实时电流 (Pack Current)',
                                key: 'PackCurrent',
                                startBit: 16,
                                bitLength: 8,
                                byteOrder: 'intel',
                                dataType: 'u8',
                                factor: 1,
                                offset: 0,
                                min: 0,
                                max: 255,
                                unit: 'A',
                                description: '母线实时电流采样值'
                            },
                            {
                                name: '电池荷电状态 (Pack SOC)',
                                key: 'PackSOC',
                                startBit: 32,
                                bitLength: 8,
                                byteOrder: 'intel',
                                dataType: 'u8',
                                factor: 0.5,
                                offset: 0,
                                min: 0,
                                max: 100,
                                unit: '%',
                                description: 'State of Charge 荷电状态百分比'
                            },
                            {
                                name: '高压接触器吸合状态 (HV Contactor)',
                                key: 'HV_Contactor',
                                startBit: 40,
                                bitLength: 2,
                                byteOrder: 'intel',
                                dataType: 'u8',
                                factor: 1,
                                offset: 0,
                                min: 0,
                                max: 3,
                                unit: '',
                                description: '主正主负高压继电器吸合状态',
                                choices: {
                                    '0': '断开 (Open)',
                                    '1': '吸合 (Closed)',
                                    '2': '预充中 (Precharging)',
                                    '3': '粘连故障 (Welded)'
                                }
                            },
                            {
                                name: '高压就绪状态 (HV_Ready)',
                                key: 'HV_Ready',
                                startBit: 42,
                                bitLength: 1,
                                byteOrder: 'intel',
                                dataType: 'bool',
                                factor: 1,
                                offset: 0,
                                min: 0,
                                max: 1,
                                unit: '',
                                description: '高压系统就绪与闭合标志 (0:未就绪, 1:就绪)'
                            }
                        ]
                    }
                ]
            };

            if (ProtoView.VersionManager) {
                ProtoView.VersionManager.ensureProtocolVersion(demoCan);
            }
            if (window.dbHelper && typeof window.dbHelper.saveProtocol === 'function') {
                const idCan = await window.dbHelper.saveProtocol(demoCan);
                demoCan.id = idCan;
            }
            if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud === 'function') {
                await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(demoCan);
            }

            // 4. 同步产品至云端
            if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.syncProductsToCloud === 'function') {
                await ProtoView.WorkspaceSync.syncProductsToCloud();
            }

            // 5. 刷新视图
            await refreshProductDatalist();
            if (typeof window.loadArincProtocolsForSelect === 'function') {
                await window.loadArincProtocolsForSelect();
            }
            await loadProtocols();
            await loadProtocolsForSelect();

            showToast('已成功载入「机电综合管理系统」示例工程！已为您预置标准 ARINC 429、RS422 串口与 CAN 总线 (J1939) 协议。', 'success');
        } catch (err) {
            console.error('加载示例工程失败:', err);
            alert('加载示例工程出现异常: ' + (err.message || err));
        }
    }

    // 控制器对象定义
    const ProductController = {
        loadProtocols,
        loadProtocolsForSelect,
        loadDemoProject,
        updateCollapseAllButtonState,
        openProductModal,
        editProductByName,
        deleteProductByName,
        moveProtocolToProduct,
        deleteProtocol,
        openProtocolWorkbench,
        openProtocolViewer,
        openCreate429Modal,
        openProtocolPropsModal,
        exportProtocolById,
        refreshProductDatalist,
        openRecycleBinModal,
        restoreProtocol,
        permanentlyDeleteProtocol,
        emptyRecycleBin,
        cloneProtocol,
        toggleCardMoreMenu,
        closeAllCardMoreMenus,
        updateRecycleBinBadge,
        bindEvents: bindProductEvents
    };

    ProtoView.Controllers.Product = ProductController;
    global.ProtoView = ProtoView;

    // 向后兼容挂载到 window
    global.loadProtocols = loadProtocols;
    global.loadProtocolsForSelect = loadProtocolsForSelect;
    global.loadDemoProject = loadDemoProject;
    global.updateCollapseAllButtonState = updateCollapseAllButtonState;
    global.openProductModal = openProductModal;
    global.editProductByName = editProductByName;
    global.deleteProductByName = deleteProductByName;
    global.moveProtocolToProduct = moveProtocolToProduct;
    global.deleteProtocol = deleteProtocol;
    global.openProtocolWorkbench = openProtocolWorkbench;
    global.openProtocolViewer = openProtocolViewer;
    global.openCreate429Modal = openCreate429Modal;
    global.openCreateProtocolModal = openCreate429Modal;
    global.openProtocolPropsModal = openProtocolPropsModal;
    global.openProps429Modal = openProtocolPropsModal;
    global.editProtocolProps = openProtocolPropsModal;
    global.editProtocol = openProtocolPropsModal;
    global.exportProtocolById = exportProtocolById;
    global.openRecycleBinModal = openRecycleBinModal;
    global.restoreProtocol = restoreProtocol;
    global.permanentlyDeleteProtocol = permanentlyDeleteProtocol;
    global.emptyRecycleBin = emptyRecycleBin;
    global.cloneProtocol = cloneProtocol;
    global.toggleCardMoreMenu = toggleCardMoreMenu;
    global.closeAllCardMoreMenus = closeAllCardMoreMenus;
    global.updateRecycleBinBadge = updateRecycleBinBadge;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindProductEvents);
    } else {
        bindProductEvents();
    }

})(typeof window !== 'undefined' ? window : this);
