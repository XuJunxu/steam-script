// ==UserScript==
// @name         Steam令牌验证器
// @namespace    https://github.com/XuJunxu/steam-script
// @version      1.1.5
// @description  生成Steam令牌、确认报价、市场上架
// @author       Nin9
// @iconURL      https://store.steampowered.com/favicon.ico
// @updateURL    https://github.com/XuJunxu/steam-script/raw/master/SteamGuardAuthenticator.js
// @downloadURL  https://github.com/XuJunxu/steam-script/raw/master/SteamGuardAuthenticator.js
// @match        http*://store.steampowered.com/*
// @match        http*://help.steampowered.com/*
// @match        http*://checkout.steampowered.com/*
// @match        http*://steamcommunity.com/*
// @exclude      http*://store.steampowered.com/login/transfer
// @exclude      http*://help.steampowered.com/login/transfer
// @exclude      http*://steamcommunity.com/login/transfer
// @exclude      http*://store.steampowered.com/login/logout/
// @exclude      http*://help.steampowered.com/login/logout/
// @exclude      http*://steamcommunity.com/login/logout/
// @exclude      http*://store.steampowered.com/widget/*
// @exclude      http*://steamcommunity.com/mobileconf/detailspage/*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @require      https://bundle.run/buffer@6.0.3
// @require      https://cdn.jsdelivr.net/npm/crypto-js@4.0.0/crypto-js.min.js
// @connect      steampowered.com
// @connect      steamcommunity.com
// ==/UserScript==

(function() {
    'use strict';

	if (typeof unsafeWindow.SteamGuardAuthenticator !== 'undefined') {
		return;
	}
	unsafeWindow.SteamGuardAuthenticator = true;

    var STEAMPP = unsafeWindow == window;
    var STEAM_CLIENT = navigator.userAgent.search(/Valve Steam Client/) != -1;

    var ACCOUNTS = getLocalAccounts();
    var AUTOCODE = GM_getValue('SG_AUTO_INPUT_CODE') ?? true;

    var request = (function() {
        if (!STEAMPP) {
            return GM_xmlhttpRequest;
        } else {
            return function(option) {
                if (String(option) !== '[object Object]') {
                    return;
                }
                option.method = option.method ? option.method.toUpperCase() : 'GET';
                option.data = option.data || {};
                if (typeof option.data != 'string') {
                    var formData = [];
                    for (var key in option.data) {
                        formData.push(''.concat(key, '=', option.data[key]));
                    }
                    option.data = formData.join('&');
                }
                if (option.method === 'GET' && option.data != null && option.data.length > 0) {
                    option.url += location.search.length === 0 ? ''.concat('?', option.data) : ''.concat('&', option.data);
                }
                var xhr = new XMLHttpRequest();
                xhr.timeout = option.timeout;
                xhr.responseType = option.responseType || 'text';
                xhr.onerror = option.onerror;
                xhr.ontimeout = option.ontimeout;
                xhr.open(option.method, option.url, true);
                xhr.setRequestHeader('requestType', 'xhr');
                if (option.headers) {
                    Object.keys(option.headers).forEach(function (key) {
                        try {
                            xhr.setRequestHeader(key, option.headers[key]);
                        } catch { }
                    });
                } else {
                    if (option.method === 'POST') {
                        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
                    }
                }
                if (option.responseType == 'json') {
                    xhr.setRequestHeader('Content-Type', 'application/json; charset=' + document.characterSet);
                }
                xhr.onload = (e) => {
                    if (option.onload && typeof option.onload === 'function') {
                        option.onload(e.target);
                    }
                };
                xhr.send(option.method === 'POST' ? option.data : null);
            };
        }
    })();

    function getFileAccounts() {
        return unsafeWindow.SG_accounts ?? [];
    }

    function getLocalAccounts() {
        return GM_getValue('SG_ACCOUNTS') ?? [];
    }
 
    function getAllAccounts() {
        return getFileAccounts().concat(getLocalAccounts());
    }

    function steamGuardAuthenticatorButtons() {
        var buttons = document.createElement('div');
        buttons.innerHTML = `<div class="guard_float_buttons" id="guard_confirmation"><img src=${confirmImg}><div>确认</div></div>
                             <div class="guard_float_buttons" id="guard_auth_code"><img src=${guardImg}><div>令牌</div></div>
                             <div class="guard_float_buttons" id="guard_reload_page"><img src=${reloadImg}><div>刷新</div></div>
                             <div class="guard_float_buttons" id="guard_scroll_top"><img src=${topImg}><div>TOP</div></div>`;

        buttons.setAttribute('style', 'user-select: none; position: fixed; right: 6px; top: 50%; z-index: 500; color: #b8b6b4; background-color: #3b4b5f; font-size: 12px; border-radius: 2px; box-shadow: 0 0 4px 0 #00000066;');
        document.body.appendChild(buttons);

        var dropdown = document.createElement('div');
        dropdown.className = 'popup_block_new';
        dropdown.id = 'SG_Authenticator_dropdown';
        dropdown.setAttribute('style', 'display: none; position: fixed; top: 50%; right: 50px; z-index: 500; user-select: none;');
        document.body.appendChild(dropdown);

        var popupMenu = document.createElement('div');
        popupMenu.className = 'popup_body popup_menu';
        popupMenu.setAttribute('style', 'overflow-y: auto; max-height: calc(100vh - 50px);');
        dropdown.appendChild(popupMenu);

        popupMenu.innerHTML = `<a class="SG_popup_menu_item" id="SG_manage_account"><span class="SG_popup_menu_item_name">管理账号</span></a>
                               <a class="SG_popup_menu_item" id="SG_auto_input_code">
                               <label class="SG_popup_menu_item_name has_right_btn" for="auto_input_code_checkbox">自动输入验证码</label>
                               <input class="SG_popup_menu_item_btn" id="auto_input_code_checkbox" type="checkbox" ${AUTOCODE ? "checked=true" : ""}></a>
                               <div id="account_list_container"></div>`;

        var accountDropdown = document.createElement('div');
        accountDropdown.className = 'popup_block_new';
        accountDropdown.id = 'SG_manage_account_dropdown';
        accountDropdown.setAttribute('style', 'display: none; position: absolute; user-select: none;');
        dropdown.appendChild(accountDropdown);

        var accountMenu = document.createElement('div');
        accountMenu.className = 'popup_body popup_menu';
        accountMenu.setAttribute('style', 'overflow-y: auto; max-height: calc(100vh - 50px);');
        accountDropdown.appendChild(accountMenu);

        accountMenu.innerHTML = `<a class="SG_popup_menu_item"><span class="SG_popup_menu_item_name" id="SG_add_account">添加账号</span></a>
                                 <a class="SG_popup_menu_item"><span class="SG_popup_menu_item_name" id="SG_import_account">导入账号</span></a>
                                 <a class="SG_popup_menu_item"><span class="SG_popup_menu_item_name" id="SG_delete_account">删除账号</span></a>`;

        buttons.querySelector('#guard_confirmation').onclick = function() {
            showConfirmationDialog();
        };

        buttons.querySelector('#guard_auth_code').onclick = function() { 
            showAuthenticatorPopupMenu();
        };

        buttons.querySelector('#guard_reload_page').onclick = function() {
            unsafeWindow.location.reload();
        };

        buttons.querySelector('#guard_scroll_top').onclick = function() {
            unsafeWindow.scroll(0, 0);
        };

        unsafeWindow.onresize = function() {
            var $elem = $J(dropdown);
            $elem.css('top', `calc(50% - ${$elem.height() / 2}px)`);
        };

        popupMenu.querySelector('#SG_manage_account').onclick = function() {
            showManageAccountDialog();
        };

        popupMenu.querySelector('#account_list_container').onclick = function(e) {
            var elem = e.target;
            if (elem.classList.contains('account_name')) {
                copyAuthCode(elem);
            } else if (elem.classList.contains('remove_account')) {
                removeAccount(elem);
            }
        };

        popupMenu.querySelector('#auto_input_code_checkbox').onchange = function() {
            AUTOCODE = this.checked;
            GM_setValue('SG_AUTO_INPUT_CODE', AUTOCODE);
        };

        accountMenu.onclick = function(e) {
            var elem = e.target;
            if (elem.id == 'SG_add_account') {
                showAddAccountDialog();
                hideAuthenticatorPopupMenu();
            } else if (elem.id == 'SG_import_account') {
                showImportAccountDialog();
                hideAuthenticatorPopupMenu();
            } else if (elem.id == 'SG_delete_account') {
                showManageAccountDialog();
                hideAuthenticatorPopupMenu();
            }
        }

        buttons.style.marginTop = `calc(-${unsafeWindow.getComputedStyle(buttons).height} / 2)`;
    }

    function showAuthenticatorPopupMenu() {
        var $Link = $J('#guard_auth_code');
        var $popup = $J('#SG_Authenticator_dropdown');

        if ($Link.hasClass('focus')) {
            hideAuthenticatorPopupMenu();
            return;
        }

        ACCOUNTS = getLocalAccounts();
        AUTOCODE = GM_getValue('SG_AUTO_INPUT_CODE') ?? true;

        var popupMenu = document.querySelector('#SG_Authenticator_dropdown .popup_menu');
        var time = Date.now();
        popupMenu.setAttribute('data-time', time);

        popupMenu.querySelector('#auto_input_code_checkbox').checked = AUTOCODE;
       
        var html = '';
        for (var i=0; i<getFileAccounts().length; i++) {
            var account = getFileAccounts()[i];
            html += `<a class="SG_popup_menu_item">
                     <span class="account_name SG_popup_menu_item_name" data-tooltip-text="点击复制该账号的验证码" data-gid=${i} data-name=${account.account_name} data-time=${time}>${account.account_name || account.steamid || '???'}</span></a>`;
        }

        for (var i=0; i<ACCOUNTS.length; i++) {
            var account = ACCOUNTS[i];
            html += `<a class="SG_popup_menu_item">
                     <span class="account_name SG_popup_menu_item_name" data-tooltip-text="点击复制该账号的验证码" data-id=${i} data-name=${account.account_name} data-time=${time}>${account.account_name || account.steamid || '???'}</span>
                     <span class="remove_account SG_popup_menu_item_btn" data-tooltip-text="删除该账号" data-id=${i} data-name=${account.account_name}></span></a>`;
        }
        
        var accountList = popupMenu.querySelector('#account_list_container');
        accountList.innerHTML = html;
        setupTooltips($J(accountList));

        $popup.css('top', `calc(50% - ${$popup.height() / 2}px)`);
        ShowWithFade($popup);
        $Link.addClass('focus');
        RegisterPopupDismissal(function() { hideAuthenticatorPopupMenu(); }, $popup);
    }

    function hideAuthenticatorPopupMenu() {
        HideMenu('guard_auth_code', 'SG_Authenticator_dropdown');
        hideManageAccountPopupMenu();
    }

    function showManageAccountPopupMenu() {
        var $Link = $J('#SG_manage_account');
        var $popup = $J('#SG_manage_account_dropdown');

        if ($Link.hasClass('focus')) {
            hideManageAccountPopupMenu();
            return;
        }

        var pos = $Link.position();

        $popup.css('left', `${pos.left - $popup.width() - 1}px`);
        $popup.css('top', `${pos.top}px`);
        ShowWithFade($popup);
        $Link.addClass('focus');
    }

    function hideManageAccountPopupMenu() {
        var $Link = $J('#SG_manage_account');
        var $popup = $J('#SG_manage_account_dropdown');
        HideWithFade($popup);
        $Link.removeClass('focus');
    }

    function showAddAccountDialog(func) {
        var content = `<div class="SG_add_account_description">Steam 帐号名称<span data-tooltip-text="即 account_name，非个人资料名称，用于自动填写 Steam 令牌验证码。"> (?)</span></div>
                    <div><input class="SG_add_account_input" type="text" id="account_name"></div>
                    <div class="SG_add_account_description">共享密钥<span data-tooltip-text="即 shared_secret，用于生成 Steam 令牌验证码。"> (?)</span></div>
                    <div><input class="SG_add_account_input" type="text" id="shared_secret"></div>
                    <div class="SG_add_account_description">64 位 Steam ID<span data-tooltip-text="即 steamid，以“7656”开头的 17 位数字，用于确认交易和市场。"> (?)</span></div>
                    <div><input class="SG_add_account_input" type="text" id="steamid"></div>
                    <div class="SG_add_account_description">身份密钥<span data-tooltip-text="即 identity_secret，用于确认交易和市场。"> (?)</span></div>
                    <div><input class="SG_add_account_input" type="text" id="identity_secret"></div>`;

        var modal = unsafeWindow.ShowConfirmDialog('添加账号', content, '确定', '取消');
        var $content = modal.GetContent();
        $content[0].id = 'SG_add_account_dialog';
        setupTooltips($content);
        modal.done(function() {
            var account = {
                account_name: $content.find('#account_name').val().trim(),
                shared_secret: $content.find('#shared_secret').val().trim(),
                steamid: $content.find('#steamid').val().trim(),
                identity_secret: $content.find('#identity_secret').val().trim()
            };
            var res = appendAccount(account);
            unsafeWindow.ShowAlertDialog('添加账号', res, '确定');

            if (typeof func === 'function') {
                func();
            }
        });

        modal.AdjustSizing();
    }

    function showImportAccountDialog(func) {
        var modal = unsafeWindow.ShowConfirmDialog('导入账号', '<textarea></textarea>', '确定', '取消');
        var $content = modal.GetContent();
        $content[0].id = 'SG_import_account_dialog';
        var $textarea = $content.find('textarea');
        $textarea.attr('placeholder', '将要导入的数据粘贴于此');
        modal.done(function() {
            var text = $textarea.val();
            var account_list = [];
            var accounts_text = text.match(/\"\d{17}\"\s*\:\s*\{[^\{\}]+\}/g) || text.match(/\{[^\{\}]+\}/g) || [text];
            try {
                for (var acct of accounts_text) {
                    var steamid = '';
                    if (acct[0] == '\"') {
                        steamid = acct.match(/^\"(\d{17})\"/)[1];
                        acct = acct.match(/(\{[^\{\}]+\})/)[1];
                    }
                    var data = JSON.parse(acct);
                    var account = {
                        account_name: data.account_name ?? '',
                        shared_secret: data.shared_secret ?? '',
                        steamid: (data.steamid || steamid || '').toString(),
                        identity_secret: data.identity_secret ?? ''
                    };
                    account_list.push(account);
                }
            } catch(err) {
                account_list = [];
                unsafeWindow.ShowAlertDialog('导入错误', '数据格式有误，请检查后再试。<br>' + acct.replace(/\n/g, '<br>'), '确定');
            }

            if (account_list.length) {
                var results = '';
                for (var acct of account_list) {
                    var res = appendAccount(acct);
                    results += `${acct.account_name || acct.steamid || '???'} ${res} <br>`;
                }
                unsafeWindow.ShowAlertDialog('导入账号', results, '确定');
            }

            if (typeof func === 'function') {
                func();
            }
        });

        modal.AdjustSizing();
    }

    function appendAccount(account) {
        if (!account.shared_secret) {
            return '失败，缺少有效的共享密钥(shared_secret)。';
        }
        if (account.steamid && account.steamid.search(/^7656\d{13}$/) != 0) {
            return '失败，无效的 64 位 Steam ID。';
        }

        if (!checkAccountExisted(account)) {
            ACCOUNTS.push(account);
            GM_setValue('SG_ACCOUNTS', ACCOUNTS);
        } else {
            return '失败，已存在相同的账号名称。';
        }

        if (account.steamid && account.identity_secret) {
            return '成功，该账号支持确认交易和市场。';
        } else {
            return '成功，该账号不支持确认交易和市场。';
        }
    }

    function checkAccountExisted(account) {
        if (account.account_name) {
            for (var acc of ACCOUNTS) {
                if (acc.account_name == account.account_name) {
                    return true;
                }
            }
        }
        return false;
    }

    function showManageAccountDialog() {
        var content = `<div id="SG_action_container">
                       <a class="SG_action_btn" id="SG_add_account_btn">添加账号</a>
                       <a class="SG_action_btn" id="SG_import_account_btn">导入账号</a>
                       <a class="SG_action_btn" id="SG_select_all_btn" style="float: right; margin: 0;">全选</a>
                       <a class="SG_action_btn" id="SG_reverse_select_btn" style="float: right;">反选</a>
                       <a class="SG_action_btn" id="SG_delete_account_btn" style="float: right;">删除</a></div>
                       <div class="SG_v_separator"></div>
                       <div id="SG_edit_accounts_container"></div>`;

        var modal = unsafeWindow.ShowDialog('管理账号', content, '保存', '取消');
        var $content = modal.GetContent();
        var $accounts = $content.find('#SG_edit_accounts_container');

        var lastEnter = null;
        var currentTop = '';

        $accounts[0].ondragstart = function(event) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setDragImage(document.createElement('div'), 0, 0);
            event.target.parentNode.classList.add('dragging');
            currentTop = event.target.parentNode.style.top;
            lastEnter = null;
        };

        $accounts[0].ondrag = function(event) {
            if (event.offsetY < 0) {
                return;
            }
            var target = event.target.parentNode;
            var $target = $J(target);
            var dragY = $target.position().top + event.offsetY;
            var top = dragY - $target.height() / 2 + $accounts[0].scrollTop;
            target.style.top = top + 'px';

            var overItem;
            var accountItems = $accounts.find('.edit_account_item');
            for (var i = 0; i < accountItems.length; i++ ) {
                var item = accountItems[i];
                if (item != target) {
                    var top2 = $J(item).position().top;
                    if (dragY >= top2 && dragY < top2 + $J(item).height()) {
                        overItem = item;
                        break;
                    }
                }
            }

            if (!overItem) {
                lastEnter = null;
            } else if (lastEnter != overItem) {
                currentTop = swapItem(target, overItem, currentTop);
                lastEnter = overItem;
            }
        };

        $accounts[0].ondragend = function(event) {
            event.target.parentNode.style.top = currentTop;
            event.target.parentNode.classList.remove('dragging');
            saveAccountList();
        };

        $accounts[0].ondragenter = function(event) {
            event.preventDefault();
        }

        $accounts[0].ondragover = function(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        } 

        $content.find('#SG_add_account_btn').on('click', function() {
            showAddAccountDialog(showAccountList);
        });
        
        $content.find('#SG_import_account_btn').on('click', function() {
            showImportAccountDialog(showAccountList);
        });

        $content.find('#SG_select_all_btn').on('click', function() {
            var checkboxs = $content.find('.edit_account_item .account_item_checkbox');
            for (var i=0; i<checkboxs.length; i++) {
                checkboxs[i].checked = true;
            }
        });

        $content.find('#SG_reverse_select_btn').on('click', function() {
            var checkboxs = $content.find('.edit_account_item .account_item_checkbox');
            for (var i=0; i<checkboxs.length; i++) {
                checkboxs[i].checked = !checkboxs[i].checked;
            }
        });

        $content.find('#SG_delete_account_btn').on('click', function() {
            unsafeWindow.ShowConfirmDialog('删除账号', '确定删除选中的账号吗？', '确定', '取消').done(function() {
                var accountItems = $content.find('.edit_account_item');
                for (var i=0; i<accountItems.length; i++) {
                    if (accountItems[i].querySelector('.account_item_checkbox').checked) {
                        $J(accountItems[i]).remove();
                    }
                }
                saveAccountList();
                showAccountList();
            });
        });

        modal.OnResize(function(maxWidth, maxHeight) {
            var height = Math.min(maxHeight - 75, $content.find('.edit_account_item').length * 40 - 6);
			$content.find('#SG_edit_accounts_container').css('height', height + 'px');
		});
        
        function saveAccountList() {
            var accountItems = $content.find('.edit_account_item');
            var accounts_list = [];
            for (var i=0; i<accountItems.length; i++) {
                accounts_list.push(accountItems[i].account);
            }
            ACCOUNTS = accounts_list;
            GM_setValue('SG_ACCOUNTS', ACCOUNTS);
        }

        showAccountList();

        function showAccountList() {
            ACCOUNTS = getLocalAccounts();
            var container = document.querySelector('#SG_edit_accounts_container');
            if (ACCOUNTS.length) {
                container.innerHTML = '';
            } else {
                container.innerHTML = '<div id="SG_no_account"><span>这里没有可管理的账号</span></div>';
            }
            
            var itemTop = 0;
            for (var account of ACCOUNTS) {
                var lineHeight = 40;
                var elemAcct = document.createElement('div');
                elemAcct.className = 'edit_account_item';
                elemAcct.innerHTML = `<div draggable="true" class="account_sort_handle"><img src="${sortImg}"></div>
                                      <span class="account_item_name">${account.account_name || account.steamid || '???'}</span>
                                      <input type="checkbox"  class="account_item_checkbox">`;
                elemAcct.account = account;
                elemAcct.style.top = `${itemTop}px`;
                itemTop += lineHeight;
                container.append(elemAcct);
            };
            modal.AdjustSizing();
        }
    }

    function swapItem(item, target, curTop) {
        var targetTop = target.style.top;
        if (parseInt(curTop.replace('px', '')) > parseInt(target.style.top.replace('px', ''))) {
            var preElem = item;
            while(true) {
                preElem = preElem.previousElementSibling;
                var tempTop = preElem.style.top;
                preElem.style.top = curTop;
                curTop = tempTop;

                if (preElem == target || !preElem.previousElementSibling) {
                    break;
                }
            }
            item.parentNode.insertBefore(item, target);
        } else {
            var nextElem = item;
            while(true) {
                nextElem = nextElem.nextElementSibling;
                var tempTop = nextElem.style.top
                nextElem.style.top = curTop;
                curTop = tempTop;
                if (nextElem == target || !nextElem.nextElementSibling) {
                    break;
                }
            }
            if (target.nextElementSibling) {
                item.parentNode.insertBefore(item, target.nextElementSibling);
            } else {
                item.parentNode.append(item);
            }
        }
        return targetTop;
    }

    function showConfirmationDialog() {
        if (!userSteamID) {
            unsafeWindow.ShowAlertDialog('确认交易和市场', '当前页面不支持确认交易和市场。', '确定');
            return;
        }

        var account;
        for (var a of getAllAccounts()) {
            if (a.steamid == userSteamID && a.identity_secret) {
                account = a;
                break;
            }
        }
        if (!account) {
            unsafeWindow.ShowAlertDialog('确认交易和市场', '当前账号不支持确认交易和市场。', '确定');
            return;
        }
        var content = `<div id="confirmation_container" style="overflow: hidden; position: relative; font-size: 14px;">
                       <div id="confirmation_message" style="display: none; font-size: 14px; font-weight: bold; text-align: center;"></div>
                       <div id="confirmation_list" style="overflow-y: auto; max-width: 600px; min-height: 200px; max-height: calc(100vh - 220px);"></div>
                       <div id="confirmation_actions">
                       <input id="select_all" type="button" value="全选" style="background-color: #588a1b">
                       <input id="reload_conf" type="button" value="刷新" style="background-color: #588a1b">
                       <input id="accept_conf" type="button" value="确认" style="background-color: #175bb4" disabled="disabled">
                       <input id="reject_conf" type="button" value="取消" style="background-color: #464d58" disabled="disabled">
                       </div>
                       <div id="confirmation_waiting" style="display: none; position: absolute; top: 0px; bottom: 0px; left: 0px; right: 0px;">
                       <div style="background-color: #000000; color: #ffffff; font-size: 16px; border-radius: 4px; margin: auto; padding: 8px 12px;"></div></div></div>`;
        var modal = unsafeWindow.ShowDialog('确认交易和市场', content);

        modal.refreshBottons = function() {
            var $content = this.GetContent();
            var all = $content.find('.mobile_conf_item input').length;
            var checked = $content.find('.mobile_conf_item input:checked').length;
            if (checked > 0) {
                $content.find('#accept_conf').attr('disabled', false);
                $content.find('#reject_conf').attr('disabled', false);
            } else {
                $content.find('#accept_conf').attr('disabled', true);
                $content.find('#reject_conf').attr('disabled', true);
            }
            if (all == 0 || all > checked) {
                $content.find('#select_all').val('全选');
            } else {
                $content.find('#select_all').val('取消全选');
            }
        };

        let $content = modal.GetContent();

        $content.find('#confirmation_list').on('click', function(e) {
            var elem = e.target;
            if (elem.classList.contains('mobile_conf_item_checkbox_input')) {
                modal.refreshBottons();
            } else if (elem.classList.contains('mobile_conf_item_info')) {
                var cid = elem.getAttribute('data-cid');
                var url = 'https://steamcommunity.com/mobileconf/detailspage/' + cid + '?' + generateConfirmationQueryParams(account, 'details' + cid, timeOffset);
                if (unsafeWindow.location.hostname == 'steamcommunity.com') {
                    unsafeWindow.ShowDialog('确认交易和市场', `<iframe src="${url}" style="height: 600px; width: 600px;"></iframe>`);
                } else {
                    unsafeWindow.open(url, '_blank', 'height=790,width=600,resize=yes,scrollbars=yes');
                }
            }
        });

        $content.find('#select_all').on('click', function() {
            var $allCheckbox = $content.find('.mobile_conf_item input');
            if ($allCheckbox.length > 0) {
                if ($allCheckbox.length > $content.find('.mobile_conf_item input:checked').length) {
                    $content.find('.mobile_conf_item input:not(:checked)').prop('checked', true);
                } else {
                    $content.find('.mobile_conf_item input:checked').prop('checked', false);
                }
                modal.refreshBottons();
            }
        });

        $content.find('#reload_conf').on('click', function() {
            loadConfirmationInfo(account, modal);
        });

        $content.find('#accept_conf').on('click', async function() {
            await sendConfirmationData(account, 'allow', modal);
            loadConfirmationInfo(account, modal);
        });

        $content.find('#reject_conf').on('click', async function() {
            await sendConfirmationData(account, 'cancel', modal);
            loadConfirmationInfo(account, modal);
        });

        loadConfirmationInfo(account, modal);
    }

    async function loadConfirmationInfo(account, modal) {
        var $content = modal.GetContent();
        var $confirmationList = $content.find('#confirmation_list');
        var $confirmationMsg = $content.find('#confirmation_message');
        var $confirmationWaiting = $content.find('#confirmation_waiting');

        $confirmationMsg.css('display', 'none');
        $confirmationWaiting.css('display', 'flex');
        $confirmationWaiting.children().text('正在加载确认信息...');

        try {
            var res = await new Promise((resolve, reject) => {
                request({
                    method: 'GET',
                    url: 'https://steamcommunity.com/mobileconf/getlist?' + generateConfirmationQueryParams(account, 'conf', timeOffset),
                    responseType: 'json',
                    onload: function(response) {
                        resolve(response.response);
                    },
                    onerror: function(error) {
                        reject(error);
                    }
                });
            });
            if (res && res.success) {
                $confirmationList.empty();
                if (res.conf && res.conf.length) {
                    var confList = '';
                    for (var item of res.conf) {
                        confList += `<div class="mobile_conf_item" id="item-${item.id}">
                                     <div class="mobile_conf_item_checkbox"><input class="mobile_conf_item_checkbox_input" type="checkbox" data-cid="${item.id}" data-ck="${item.nonce}"></div>
                                     <div class="mobile_conf_item_icon"><img src=${item.icon}></div>
                                     <div class="mobile_conf_item_info" data-cid="${item.id}" data-ck="${item.nonce}">
                                     <div class="mobile_conf_item_time">${item.type_name} - ${new Date(item.creation_time * 1000).toLocaleString()}</div>
                                     <div class="mobile_conf_item_headline">${item.headline}</div>
                                     <div class="mobile_conf_item_summary">${item.summary.join('<br/>')}</div>
                                     </div></div>`;
                    }
                    $confirmationList.html(confList);
                } else {
                    $confirmationMsg.css({'color': 'white', 'display': 'block'}).text('您当前没有任何确认信息。');
                }
                modal.refreshBottons();
            } else {
                $confirmationMsg.css({'color': 'red', 'display': 'block'}).text(res && res.message || '获取确认信息失败，请稍后再试。');
            }
        } catch (err) {
            $confirmationMsg.css({'color': 'red', 'display': 'block'}).text('获取确认信息失败，请稍后再试。');
        }
        $confirmationWaiting.css('display', 'none');
        modal.AdjustSizing();
    }

    async function sendConfirmationData(account, op, modal) {
        var $content = modal.GetContent();
        var $confirmationMsg = $content.find('#confirmation_message');
        var $confirmationWaiting = $content.find('#confirmation_waiting');
        var $checked = $content.find('.mobile_conf_item input:checked');
        
        if ($checked.length == 0) {
            return;
        }

        $confirmationMsg.css('display', 'none');
        $confirmationWaiting.css('display', 'flex');
        $confirmationWaiting.children().text('正在发送操作信息...');

        var checkedID = [];
        var queryString = 'op=' + op + '&' + generateConfirmationQueryParams(account, op, timeOffset);
        $J.each($checked, function(i, elem) {
            var $elem = $J(elem);
            queryString += '&cid[]=' + $elem.attr('data-cid');
            queryString += '&ck[]=' + $elem.attr('data-ck');
            checkedID.push($elem.attr('data-cid'));
        });

        try {
            var res = await new Promise((resolve, reject) => {
                request({
                    method: 'POST',
                    url: 'https://steamcommunity.com/mobileconf/multiajaxop',
                    data: queryString,
                    headers:    {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    responseType: 'json',
                    onload: function(response) {
                        resolve(response.response);
                    },
                    onerror: function(error) {
                        reject(error);
                    }
                });
            });
            if (res && res.success) {
                for (let cid of checkedID) {
                    $J(`#item-${cid}.mobile_conf_item`).remove();
                }
                modal.refreshBottons();
            } else {
                $confirmationMsg.css({'color': 'red', 'display': 'block'}).text(res && res.message || '执行此操作时出现问题。请稍后再试。');
            }
        } catch (err) {
            $confirmationMsg.css({'color': 'red', 'display': 'block'}).text('执行此操作时出现问题。请稍后再试。');
        }
        $confirmationWaiting.css('display', 'none');
        modal.AdjustSizing();
    }

    function removeAccount(elem) {
        unsafeWindow.ShowConfirmDialog('删除账号', `确定删除该账号 (${elem.getAttribute('data-name')}) 吗？`, '确定', '取消').done(function() {
            var index = elem.getAttribute('data-id');
            if (index >= ACCOUNTS.length) {
                unsafeWindow.ShowAlertDialog('错误', '无法删除该账户，请稍后再试。', '确定').done(function() {
                    unsafeWindow.location.reload();
                })
            } else {
                ACCOUNTS.splice(index, 1);
                GM_setValue('SG_ACCOUNTS', ACCOUNTS);
                unsafeWindow.ShowAlertDialog('删除账号', '删除成功。', '确定');
            }
        }); 
    }

    async function copyAuthCode(elem) {
        let account;
        if (elem.hasAttribute('data-gid')) {
            account = getFileAccounts()[elem.getAttribute('data-gid')];
        } else if (elem.hasAttribute('data-id')) {
            account = ACCOUNTS[elem.getAttribute('data-id')];
        }
        
        let [code, timeout] = generateAuthCode(account.shared_secret, timeOffset);
        try {
            await navigator.clipboard.writeText(code);
        } catch (err) {
            var input = document.createElement('input');
            document.body.appendChild(input);
            input.setAttribute('style', 'position: fixed; top: 0px; left: -999px;');
            input.value = code;
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        
        elem.style.width = unsafeWindow.getComputedStyle(elem).width;
        elem.textContent = '复制成功';
        elem.classList.add('copy_code_success');
        setTimeout(function() {
            elem.classList.remove('copy_code_success');
            elem.textContent = code;
            if (!elem.parentNode.classList.contains('show_auth_code') || elem.getAttribute('data-code') != code) {
                elem.parentNode.classList.add('show_auth_code');
                elem.setAttribute('data-code', code);
                showCountdownProgress(elem, code, timeout);
            }
        }, 1000);
    }

    function showCountdownProgress(elem, code, timeout) {
        if (document.querySelector('#SG_Authenticator_dropdown').style.display == 'none' || document.querySelector('#SG_Authenticator_dropdown .popup_menu').getAttribute('data-time') != elem.getAttribute('data-time') || elem.getAttribute('data-code') != code) {
            return;
        }
        if (timeout <= 0 ) {
            elem.textContent = elem.getAttribute('data-name');
            elem.parentNode.classList.remove('show_auth_code');
            return;
        }
        elem.parentNode.style.backgroundSize = `${(timeout / 30 * 100).toFixed(2)}%`;
        setTimeout(function() {
            showCountdownProgress(elem, code, timeout-1);
        }, 1000);
    }

    function setupTooltips(selector) {
        if (unsafeWindow.location.hostname == 'store.steampowered.com') {
            BindTooltips(selector, {tooltipCSSClass: 'store_tooltip'});
        } else if (unsafeWindow.location.hostname == 'help.steampowered.com') {
            BindTooltips(selector, {tooltipCSSClass: 'help_tooltip'});
        } else if (unsafeWindow.location.hostname == 'steamcommunity.com') {
            BindTooltips(selector, {tooltipCSSClass: 'community_tooltip'});
        }
    }

    function bufferizeSecret(secret) {
        if (typeof secret === 'string') {
            // Check if it's hex
            if (secret.match(/[0-9a-f]{40}/i)) {
                return buffer.Buffer.from(secret, 'hex');
            } else {
                // Looks like it's base64
                return buffer.Buffer.from(secret, 'base64');
            }
        }
        return secret;
    }

    function generateAuthCode(secret, timeOffset) {
        secret = bufferizeSecret(secret);

        let time = Math.floor(Date.now() / 1000) + (timeOffset || 0);

        let b = buffer.Buffer.allocUnsafe(8);
        b.writeUInt32BE(0, 0); // This will stop working in 2038!
        b.writeUInt32BE(Math.floor(time / 30), 4);

        let hmac = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA1, CryptoJS.lib.WordArray.create(secret));
        hmac = buffer.Buffer.from(hmac.update(CryptoJS.lib.WordArray.create(b)).finalize().toString(CryptoJS.enc.Hex), 'hex');

        let start = hmac[19] & 0x0F;
        hmac = hmac.slice(start, start + 4);

        let fullcode = hmac.readUInt32BE(0) & 0x7FFFFFFF;

        const chars = '23456789BCDFGHJKMNPQRTVWXY';

        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(fullcode % chars.length);
            fullcode /= chars.length;
        }

        let timeout = Math.floor(time / 30) * 30 + 30 - time;

        return [code, timeout];
    };

    function generateConfirmationKey(identitySecret, time, tag) {
        identitySecret = bufferizeSecret(identitySecret);

        let dataLen = 8;

        if (tag) {
            if (tag.length > 32) {
                dataLen += 32;
            } else {
                dataLen += tag.length;
            }
        }

        let b = buffer.Buffer.allocUnsafe(dataLen);
        b.writeUInt32BE(0, 0);
        b.writeUInt32BE(time, 4);

        if (tag) {
            b.write(tag, 8);
        }

        let hmac = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA1, CryptoJS.lib.WordArray.create(identitySecret));
        return hmac.update(CryptoJS.lib.WordArray.create(b)).finalize().toString(CryptoJS.enc.Base64);
    };

    function getDeviceID(steamID) {
        let salt = '';
        return 'android:' + CryptoJS.SHA1(steamID.toString() + salt).toString(CryptoJS.enc.Hex).replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12}).*$/, '$1-$2-$3-$4-$5');
    };

    function generateConfirmationQueryParams(account, tag, timeOffset) {
        var time = Math.floor(Date.now() / 1000) + (timeOffset || 0);
        var key = generateConfirmationKey(account.identity_secret, time, tag);
        var deviceID = getDeviceID(account.steamid);
        return 'a=' + account.steamid + '&tag=' + tag + '&l=schinese&m=react&t=' + time + '&p=' + encodeURIComponent(deviceID) + '&k=' + encodeURIComponent(key);
    }

    var confirmImg = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwABjUwAAY1MAboJuKAAAARESURBVHhe7ZrdaxxVGIff9yQWzSatpXrrx4XgjR9gLAkWtZDsx+ym4E0CFYtaEaT+D/kXRC9qS7X0RmG9kc3szGxiWAVBkEoVP2698spqLdtslWbm+L6zZ/JhMsnufO86z82e+W0Y5vlx5pwTEsjJycnJycn534Lqc+RotVoFubl5VoJzXIwf+axUKv2qvtrFSBbQbjQe+mcc10jvWRV1BIiFoqZ9pa63GLkCXPkxXAfEp1XkIqXcAAdqlYWFL1XkMlIF+Ml7uCUIKqGyXYJQn0PPYfIMIhZoFuimab6sotEooN1meXGgvEevBFu3dP20e+2mQ4wr32V5OFT+P3QdEKWhLiCEfA8JPw9tAaHlCVoU/x7KNaDdboeWd0FoDt0M6MlvhJaXAN/ZDswPVQGGYTwspPNFVPK1Wu3W0BQQhzxfD0UBcckzvgX8VK8f+e3YxAxu4q1itfqjihMnTnlm3wJ0XX90TIBFXz7J11LCtc5G9/zi4qLt/kBCxC3P7ClAybfpi8dV5EI3+aRzp3suqRKSkGd2nQP85BnKzk4VJq7V6/UxFcUGyyPYkW11fvLMVgHrJD/uI++BCK8enSxcjbMETx4Bn1JRIPqRZ9wCWP4eSv4d2Vd+G/na1OT9H9MxMvJTZNLyjFhbazziyiM+prJDQRDnWqb+UZQlpCHPCPueuDqI/Db4umXqV5aXl0OXkJY8I2iLO6XGA0MP/MbszPTlMCWkKc8IQHlDjYMh8fzs89OXgpSQtjwj7oOxN+mk87u6DobAt2ZPTl+kNWHPucKPLMgzYk7TfnHQmaPxzV4UEMS3TUPvq4SsyDNbD2tZK89IG9YR8YSKAkFrysWyVr1A96Hn20uW5Jmt97ZcXvhBSJyjG/+hokDQYemdltn8YL+ZkDV5ZtfCVarVvpcg5unh/1RRUC5YZvP9nSVkUZ7Zs3JrmnaDNkcqAUKVQObv0mHpPR6yvMigPOO7YLV0/TkpJP+B8biKgvIhPfoLdJ/MyTO+BTCrzea0Dc4aLWgPqigV4pJnDjy8FKvV6xJlkYZ/9ZLkiVOeOXAGeNAWeZK2yFWaCcdUlAhxyzN9HV9pi/yWtsgSPdBtFcVOEvJMXzPAY9UwZhxpt2izP6qiWEhKnhmoAMY0zVlwNlv0OkypKFKSlGf6egV2UqlUvnHAqdCw00uiI2l5ZuAZ4GEYjVMo0aSZMKmiUKQhzww8Azw07czX4IBGJ8Y7KgpMWvJM4BngQSfGFx2UBs2EgooGIk15JnQBDO0OL9nSbg5aQtryTOBXYCfuPyAKqJFQV0WHkgV5JpIZ4GFZ+mn+NzQaTvSS/cmKPBPJDPAol2tt2iLP0NB3JmRJnol0BniYuj5H1Tbo5g+oyCVr8kwsBTBWszkPKD+nofs6SJDXbQeLWZJnYiuAWVlZeWJcwCuIcPN2p/vp0tLSXfVVTk5OTk5OTk7KAPwL4Ch0dBS7DPkAAAAASUVORK5CYII=`;
    var guardImg = `data:image/png;base64,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`;
    var reloadImg = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADdcAAA3XAUIom3gAAAdpSURBVHhe1ZsJbBRlFMe/b2Zp2dKWcIhHUCOIoESUaIxiNCkR2k6XWkwAQ1SskogBA8GYKCYmhHgEjxgNglEMItGUGKDtHj2QFRMElBAVFaNGotxKAG272+3uzuf/K68NMHt8s8fs9pds5r03k5l5//muN9NyVmACgdZqbrIPGWcuYfKVtR7PZ7TLETTaFgwkv45xPh7WVYyLLQGv93Ha5QgFFwDJX0MWTK5BhI1OilB4AS7DaRGKTgCJkyIUpQASp0QoWgEkTohQ1AJI8i1C3tcBBw68P+yfE1ffyXR2D/SexpiYhMuO55yNxm43fnr/gWkQQphM8CexTthEoZyQFwG2bt1aUlFR5uGCLxBMVOMiI2lXVuRDhJwKEAy2jO0N8WdgLkHTHXchmltyLUJOBGhpaSkrcWnPwXwWv4r+YB7JpQhZC9Dmba5hmrYBp7qeQo4gRRCCLzI8ni0UyoiMBfD7/aWcmW8wwZZiQMtpV7LB+b37vx2zevVqk3zbZDQN7tzZfCUX8S+R9bICJi9bAVmZY/vm8eQncmF2IvEbKFQQZBfgTHu0pq7uUwplhNIcPIDfv20iLrobyV9HoYJAyTci+az6v0RZgPb29nHMZF9heiuW5DdTKCuUxgC5sDHjfduRfDE0+5wlL1ESoLK8bC3GuhnkFoR8JC9JOwi2+XyzBDPb8fSzGu2RQDfO0IHTdJjM/KGvT/xRWXn230j4irPYLWuCpOQreUnKpJqamtyVFWU/4ulPoFAGiD+RwOuRqLm5oaGhi4KDtPm9IWySCpDP5CUpu8DIihErM00eNx7F76VSd/mU2rr6dYmST0e+k5ckbQFer3eUzsURNFnblRzWJ0d1xh+aXVd3gEJJSdYCnEhekrQF6MzEEjeD5Jk4LLg2QyX5ZDiVvCShAMFg0IUC52lylcHC9CjXYtWGYRyjkG2cTF6SUIBIKFSDvjH4vl6RaNxk82pq5h4lXw0hTpDlePKSxF2Am/PJUgbd5RWPx7OfXGVQ2S+VYwaaz0kkv9DJ5CWWQRBPQWvz+/7GnD2GQmmRTT8aM6fU19fLAW1IYWkBba2tt9tJXsKZeGsoJi+xCCBc2t1kqhIOR2I5fVPrJBYBELiVTEXErrlz554nZ8hhHQQFm0SWKjtpOySxCsDYeNqqYfLvyRqSJBBAyC82yghdP0LmkMQiAKa0lKXp5Qzv7S2K/o/pm6f60WEWLDsCPm8XpsFyctMSM9loLIDOkes47X7vI6g/3kEqoyiUGCGOCY0trq2d006RfiwtAHN6mExVKmnrOPLbhMnY+rTJS+TfIQmOYy/F2gU4O0OmErouCvaeUNPiU9CElVsr+oLl2ESzgK1KTsS5zXVDDomz28hSg7PjZA2SoAvwX8lUQuPsPjILwQO0VQKD4e9kDmLtAoJ/R6YanNXIr8PkOUYwGByOfm2Qq4SmaZY1S4IxIPo1mapUlLj4w2Q7Rm9P1zxsbBVtGDD3kTmIRYDa2gcPYy1g6SupQKt5vv8tkkPIa3HOXyRXCTT/3mjUtDxc6xjAucCvmVwlsG6YFAl1Lyc370TC3ctw0cnkKoGxbVeikt0igMQUcdt/sIxWsybQ3DyV3Lzh9XpvRjovk2sD0UTGJSQUwDDq96DN/EyuEmg1bubSt2NAHEuhnNO5bdsYl8Zk67Q16KL5n+2Li8/JvYSEAgA8UPb2BVMd2RWGubS2fIjQ2dk5Jl5a0gnTbrkO+AfJ3lglEwBVrr5ZCPYXucpgZXYHZoU9fv+OWyiUNYFA89R4NLIXJ59OITuEh5WKd8m2kLRKklwoNNgn5NolhNF01fDhZeuqqqpiFLOFHO3D4Z4VeEqr4Wa61ni1xvCsIttCSgEAD/hav0D/riLfNhDwF1Rrr50+faapsbGxl8IpOYCF1RmsLTC9voBudSOFM0CcMpk+2TCM/yhgIZ0AaH47JnPhOggz29XeeXQpH6rN3RrXD2klJUf6+vrOu91uHg6HK3TTnIDKfRpuaSZu3MCAknWVKUzWUOvxpJzS0wogafO3PoFDN5I7RBCbaow5jeQkJekgeDE40UemEEPn1bdgB/tiYil5KVESQNLdE34KJ+4gt3gR4iTTow2qH2qUusAAweDW8kjI3Yn+affjiSNgwD0tWGymYTQoL+JsCSDB1FTe29O9jWt8FoWKAgywJ5gWn41i7icKKaHcBQbAnN7dFQp7cMGPKVR40Oex2LnLbvIS2y3gYgIB32Iu5BtZe6/ScwnW+Rs117nl1dWP9VDIFlkJIOlAdRbXxAaUm/dTyClOcKYtqTaMVvIzImsBJPLDQ0ebbxEWHmtwRnuf1uwjR/c3S92htVVV87svhDInJwIMIP+usGLEiEYsX1fIypDCOQEj/Bnc7PqYyd7zeDynKJw1ORVggP4W4W+pEkxbiBufg1oio/8fwnl6cIedOEdTV1eoecGCBXY/2qQlLwJcDJLQOjp808wYvxdF9nSMFTchei3WEvKF5kB9EcZx57DvOOK/CTN+iOl8nxD6NyhkInRMHmDsf8MM44CmkfDPAAAAAElFTkSuQmCC`;
    var topImg = `data:image/png;base64,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`;
    var sortImg = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEaEAABGhAVN0B3oAAAK3SURBVHhe7ds/b9NAHMbxu7RuwYlg6YK6gAS8ANiRsiRLMyEixIzIe+AF8B6CEGwIhZEudInEDi+AInWqWLIgNQaaNIef+n4LqnP+c/fzWfFnSeylfr6KlNpVpajAdDrd/vs7eiXE6nlypvVm93r4stvtLpNjPuwBLsdH8/fxT36iTyWU+Lgbtp9xR2ANkDqeVBCBLYBxPGGOwBIg83jCGMF5gNzjCVMEpwEKjycMEZwFKD2eOI7gJIC18cRhBOsBrI8njiJYDeBsPHEQwVoA5+OJ5QhWArCNJxYjlA7APp5YilAqQGXjiYUIhQNUPp6UjFAogDfjSYkIuQN4N54UjJArgLfjSYEImQN4P57kjJApQG3GkxwRWvp1rT/zs9e1GQ/xtZ5H87E+Wsv4CTg6+nRvtZTf9WGttC7U/d5gcKwPr2T8BKhzeUu/rR0lzdduDPArir7FL7PkqFZmIgi+6vepjAGGw+GZXInHQqmf+pT/4mvFNff7/bk+kyrz1+B4PA7u7O/fXbYuAn3KS9urrcXJ6emP0Wi00KcajUaj0Wg0Go0rbPyvwpkCfD48fKSk+iAy3F56ATdDSj7tHxx80WdSGQNMJpPOjU54Er/dS87UxkxuBbdNd4TG2+GbYfggfqnbeNgTi8VD/T6VMYDcqdFzgP/IDM8wjAF6vcGxWql3+rA2pBJvTc8DwRgArrU7L/CoWR/6L77WnbA90kdrZf4a3Og/jJCN/tMY8TZCgfGQOwB4F6HgeCgUALyJUGI8FA4AlUcoOR5KBYDKIlgYD6UDAHsES+PBSgBgi2BxPFgLAM4jWB4PVgOAswgOxoP1AGA9gqPx4CQAWIvgcDw4CwClIzgeD04DQOEIDOPBeQDIHYFpPLAEgMwRGMcDWwAwRmAeD6wBIDVCBeOBPQBcRvDi3+eF+AcybP4k8y7JeAAAAABJRU5ErkJggg==`;

    var styleElem = document.createElement('style');
    document.body.appendChild(styleElem);
    styleElem.innerHTML = `
        .guard_float_buttons {
            width: 40px;
            text-align: center;
            cursor: pointer;
        }
        .guard_float_buttons:not(:last-child) {
            border-bottom: 1px solid #00000044;
        }
        .guard_float_buttons:hover {
            background-color: #00000022;
        }
        .guard_float_buttons img {
            width: 20px;
            height: 20px;
            display: inline-block;
            margin-top: 8px;
            vertical-align: middle;
        }
        .guard_float_buttons div {
            padding: 5px 0px;
            font-family: "Motiva Sans",Arial,Helvetica,sans-serif;
        }
        #SG_Authenticator_dropdown .SG_popup_menu_item {
            display: block;
            text-decoration: none;
            position: relative; 
            padding: 0;
            cursor: pointer;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #SG_Authenticator_dropdown .SG_popup_menu_item_name {
            display: block; 
            padding: 5px 12px 5px 12px; 
            min-width: 50px;
            font-size: 12px;
            color: #dcdedf;
            line-height: normal;
            vertical-align: middle;
            text-decoration: none;
            font-family: "Motiva Sans",Arial,Helvetica,sans-serif;
            cursor: pointer;
        }
        #SG_Authenticator_dropdown .SG_popup_menu_item_btn {
            position: absolute;
            top: 0;
            vertical-align: middle; 
            padding: 0 7.5px;
            width: 12px;
            height: 100%;
            margin: 0;
            cursor: pointer;
        }
        #SG_Authenticator_dropdown span.SG_popup_menu_item_btn {
            right: 0;
            background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAQAAAD8fJRsAAAAkElEQVR4AXWQxWEDMRBFJ6AWArqGmW7G12HMDN0ZFmr4dqKF00rDPGPhycnr/vi9nJVPl2qI7Dd0WZpZEyFEygKhy1CkPsX4JCLlB6OP6jo3eRHxhh3xA+OBLULedCtExDOGcRvM6DZzpP/RxgtR4fDKat/ylPUKpZwao1A769VBDbls3H5WO6KfjVu5YOVJDkyDcoTnvnKRAAAAAElFTkSuQmCC);
            background-position: center;
            background-repeat: no-repeat;
            background-origin: content-box;
        }
        #SG_Authenticator_dropdown input.SG_popup_menu_item_btn {
            right: 7.5px; 
        }
        #SG_Authenticator_dropdown .SG_popup_menu_item_name.has_right_btn {
            padding: 5px 27px 5px 12px; 
        }
        #SG_Authenticator_dropdown .SG_popup_menu_item.focus, #SG_Authenticator_dropdown .SG_popup_menu_item.focus .SG_popup_menu_item_name, #SG_Authenticator_dropdown .SG_popup_menu_item:hover, #SG_Authenticator_dropdown .SG_popup_menu_item:hover .SG_popup_menu_item_name {
            color: #171d25;
            background: #dcdedf;
        }
        #SG_Authenticator_dropdown .remove_account.SG_popup_menu_item_btn {
            display: none;
        }
        .copy_code_success {
            color: #57cbde !important;
        }
        .show_auth_code {
            background: linear-gradient(#1a73e8cc, #1a73e8cc) no-repeat;
        }
        .mobile_conf_item {
            display: flex;
            align-items: center;
            min-height: 90px;
            border-bottom: 1px solid black;
        }
        .mobile_conf_item_checkbox {
            transform-origin: left;
            transform: scale(2);
            margin-left: 10px;
            display: flex;
        }
        .mobile_conf_item_checkbox input{
            cursor: pointer;
            margin: 0;
        }
        .mobile_conf_item_icon {
            margin-right: 15px;
            margin-left: 30px;
            height: 64px;
            width: 64px;
        }
        .mobile_conf_item_icon img {
            height: 64px;
            width: 64px;
        }
        .mobile_conf_item_info {
            cursor: pointer;
        }
        .mobile_conf_item_time {
            font-size: 12px;
            color: #acb2b8;
            pointer-events: none;
        }
        .mobile_conf_item_headline {
            font-weight: bold;
            font-size: 14px;
            color: white;
            pointer-events: none;
        }
        .mobile_conf_item_summary {
            font-size: 14px;
            color: white;
            pointer-events: none;
        }
        #confirmation_actions {
            margin: 12px 0px 5px 5px;
        }
        #confirmation_actions input{
            margin-right: 12px;
            cursor: pointer;
            font-size: 14px;
            border: none;
            border-radius: 4px;
            color: white;
            width: 80px;
            height: 30px;
            box-shadow: 2px 2px 2px #00000099;
        }
        #confirmation_actions input:hover {
            box-shadow: 0px 0px 2px 2px #88888888;
        }
        #confirmation_actions input[disabled="disabled"] {
            box-shadow: none;
            color: #999999;
            cursor: auto;
        }
        #confirmation_actions input:focus {
            outline: none;
        }
        #SG_action_container {
            margin-bottom: 0px;
        }
        .SG_action_btn {
            color: white;
            padding: 0px 10px;
            margin-right: 5px;
            background: #464d58;
            user-select: none;
            border-radius: 4px;
            box-shadow: 1px 1px 2px #00000066;
            font-size: 13px;
            cursor: pointer;
            display: inline-block;
            line-height: 26px;
        }
        .SG_action_btn:hover {
            background: #3e6994;
        }
        #SG_edit_accounts_container {
            overflow: auto;
            min-height: 160px;
            position: relative;
            width: 450px;
        }
        #SG_edit_accounts_container .edit_account_item {
            display: flex;
            color: white;
            background: #405163e6;
            line-height: 34px;
            width: 100%;
            position: absolute;
            transition: background-color 300ms, top 300ms;
        }
        #SG_edit_accounts_container .edit_account_item.dragging { 
            z-index: 10;
            background-color: #3d4b5a;
            transition: background-color 300ms;
        }
        #SG_edit_accounts_container .account_sort_handle {
            cursor: move;
            border-right: 1px solid #00000033;
        }
        #SG_edit_accounts_container .account_sort_handle img {
            height: 14px;
            vertical-align: middle;
            margin: 0 5px;
        }
        #SG_edit_accounts_container .account_item_name {
            flex: auto;
            align-content: center;
            margin: 0 8px;
            font-size: 16px;
        }
        #SG_edit_accounts_container .account_item_checkbox {
            cursor: pointer;
            flex: none;
            transform: scale(1.5);
            height: 12px;
            margin: 0px;
            position: absolute;
            top: calc(50% - 6px);
            right: 10px;
        }
        #SG_no_account {
            color: white;
            width: 100%;
            height: 100%;
            text-align: center;
            display: flex;
            align-items: center;
        }
        #SG_no_account span {
            flex: auto;
        }
        #SG_add_account_dialog .SG_add_account_description {
            font-size: 14px;
            margin-bottom: 6px;
        }
        #SG_add_account_dialog .SG_add_account_input, #SG_import_account_dialog textarea {
            font-family: Arial, Helvetica, Verdana, sans-serif;
            font-size: 13px;
            color: #C6D4DF;
            background-color: rgba(0, 0, 0, 0.2);
            border-radius: 3px;
            border: 1px solid #000;
            margin-bottom: 10px;
            outline: none;
            box-sizing: border-box;
        }
        #SG_add_account_dialog .SG_add_account_input {
            width: 100%;
            line-height: 20px;
            padding: 4px 8px 4px 8px;
        }
        #SG_import_account_dialog textarea {
            width: 500px;
            height: 400px;
            padding: 6px 8px 6px 8px;
            resize: none;
            margin-bottom: 2px;
        }
        .SG_v_separator {
            height: 1px;
            background: #1D1D1D;
            border-bottom: 1px solid #3B3B3B;
            margin: 8px 0;
        }
    `;
    
	steamGuardAuthenticatorButtons();

    var intersectionObserver = new IntersectionObserver(function(entries) {
        if (entries[0].intersectionRatio > 0) {
            var name = $J('#login_twofactorauth_message_entercode_accountname, [class^="login_SigningInAccountName"], [class^="newlogindialog_AccountName"]').text();
            $J.each(getAllAccounts(), function(i, v) {
                if(name == v.account_name) {
                    var $AuthCodeInput = $J('#twofactorcode_entry, [class^="login_AuthenticatorInputcontainer"] input.DialogInput, [class^="newlogindialog_SegmentedCharacterInput"] input, [class^="segmentedinputs_SegmentedCharacterInput"] input');
                    var dt = new DataTransfer();
                    dt.setData('text', generateAuthCode(v.shared_secret, timeOffset));
                    $AuthCodeInput[0].dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true}));
                    return false;
                }
            });
        }
    });

    var mutationObserver = new MutationObserver(function() {
        if ($J('#page_content form input[maxlength="1"], .page_content form input[maxlength="1"]').length == 5) {
            var name = $J('#page_content form span, .page_content form span').text();
            $J.each(getAllAccounts(), function(i, v) {
                if(name == v.account_name) {
                    var $AuthCodeInput = $J('#page_content form input[maxlength="1"], .page_content form input[maxlength="1"]');
                    var dt = new DataTransfer();
                    dt.setData('text', generateAuthCode(v.shared_secret, timeOffset));

                    setTimeout(function() {     //过快的输入验证码会显示登录错误，虽然可以成功登录
                        $AuthCodeInput[0].dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true}));
                    }, 500);
                    
                    return false;
                }
            });
        }

        if ($J('div[data-featuretarget="login"] [href="https://help.steampowered.com/wizard/HelpWithLoginInfo?lost=8&issueid=402"]').length) {
            $J('div[data-featuretarget="login"] [href="https://help.steampowered.com/wizard/HelpWithLoginInfo?lost=8&issueid=402"]')[0].parentNode.firstElementChild.firstElementChild.click();
        }

        if ($J('#twofactorcode_entry, [class^="login_AuthenticatorInputcontainer"] input.DialogInput, [class^="newlogindialog_SegmentedCharacterInput"] input, [class^="segmentedinputs_SegmentedCharacterInput"] input').length) {
            intersectionObserver.observe($J('#twofactorcode_entry, [class^="login_AuthenticatorInputcontainer"] input.DialogInput, [class^="newlogindialog_SegmentedCharacterInput"] input, [class^="segmentedinputs_SegmentedCharacterInput"] input')[0]);
        }

        if ($J('[class^="newlogindialog_EnterCodeInsteadLink"] [class^="newlogindialog_TextLink"]').length) {
            $J('[class^="newlogindialog_EnterCodeInsteadLink"] [class^="newlogindialog_TextLink"]')[0].click();
        }
    });

    var userSteamID;

    if (typeof unsafeWindow.g_steamID != 'undefined' && unsafeWindow.g_steamID) {
        userSteamID = unsafeWindow.g_steamID;
    } else if ((STEAM_CLIENT || document.querySelector('#account_dropdown .account_name')) && (!STEAMPP || unsafeWindow.location.href.indexOf('steamcommunity.com') !== -1)) {
        request({
            method: 'GET',
            url: 'https://steamcommunity.com/my/?xml=1',
            onload: function(response) {
                if (response.responseXML) {
                    var steamID = $J(response.responseXML).find('steamID64').text();
                    if (steamID) {
                        userSteamID = steamID;
                    }
                }
            }
        });
    } 

    if (AUTOCODE && !STEAM_CLIENT && (!document.querySelector('#account_dropdown .account_name') || unsafeWindow.location.href.indexOf('checkout.steampowered.com/login/?purchasetype=') !== -1)) {
        mutationObserver.observe(document.body, {childList: true, subtree: true});
    }

    var timeOffset = 0;

    if (!STEAMPP) {
        request({
            method: 'POST',
            url: 'https://api.steampowered.com/ITwoFactorService/QueryTime/v0001',
            responseType: 'json',
            onload: function(response) {
                if (response.response && response.response.response && response.response.response.server_time) {
                    timeOffset = response.response.response.server_time - Math.floor(Date.now() / 1000);
                }
            }
        });
    }

    unsafeWindow.confirmSellItems = async function() {
        if (!userSteamID) {
            return;
        }

        var account;
        for (var a of getAllAccounts()) {
            if (a.steamid == userSteamID && a.identity_secret) {
                account = a;
                break;
            }
        }
        if (!account) {
            return;
        }

        try {
            var res = await new Promise((resolve, reject) => {
                request({
                    method: 'GET',
                    url: 'https://steamcommunity.com/mobileconf/getlist?' + generateConfirmationQueryParams(account, 'conf', timeOffset),
                    responseType: 'json',
                    onload: function(response) {
                        resolve(response.response);
                    },
                    onerror: function(error) {
                        reject(error);
                    }
                });
            });

            if (res && res.success && res.conf && res.conf.length) {
                var need_send = false;
                var queryString = 'op=allow' + '&' + generateConfirmationQueryParams(account, 'allow', timeOffset);
                for (var item of res.conf) {
                    if (item.type == 3) {
                        queryString += '&cid[]=' + item.id;
                        queryString += '&ck[]=' + item.nonce;
                        need_send = true;
                    }
                }

                if (!need_send) {
                    return;
                }

                try {
                    var res = await new Promise((resolve, reject) => {
                        request({
                            method: 'POST',
                            url: 'https://steamcommunity.com/mobileconf/multiajaxop',
                            data: queryString,
                            headers:    {
                                'Content-Type': 'application/x-www-form-urlencoded'
                            },
                            responseType: 'json',
                            onload: function(response) {
                                resolve(response.response);
                            },
                            onerror: function(error) {
                                reject(error);
                            }
                        });
                    });
                } catch(err) {
                    console.log('发送确认信息失败');
                }
            }
        } catch(err) {
            console.log('获取确认信息失败');
        }
    };

})();