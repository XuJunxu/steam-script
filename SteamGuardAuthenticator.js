// ==UserScript==
// @name         Steam令牌验证器
// @namespace    SteamGuardAuthenticator
// @version      1.0.1
// @description  生成Steam令牌、确认报价、市场上架
// @author       Nin9
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

    var ACCOUNTS_GLOBAL = unsafeWindow.SG_accounts || [];

    var ACCOUNTS = GM_getValue('SG_ACCOUNTS') || [];
    var AUTOCODE = GM_getValue('SG_AUTO_INPUT_CODE') ?? true;

    var ACCOUNTS_ALL = ACCOUNTS_GLOBAL.concat(ACCOUNTS);

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
        dropdown.setAttribute('style', 'display: none; position: fixed; top: 50%; right: 52px; overflow: hidden; z-index: 500;');
        document.body.appendChild(dropdown);

        var popupMenu = document.createElement('div');
        popupMenu.className = 'popup_body popup_menu';
        popupMenu.setAttribute('style', 'overflow-y: auto; max-height: calc(100vh - 50px);');
        dropdown.appendChild(popupMenu);

        buttons.querySelector('#guard_confirmation').onclick = function() {
            showConfirmationDialog();
        };

        buttons.querySelector('#guard_auth_code').onclick = function() { 
            showAuthenticatorPopupMenu(this);
        };

        buttons.querySelector('#guard_reload_page').onclick = function() {
            unsafeWindow.location.reload();
        };

        buttons.querySelector('#guard_scroll_top').onclick = function() {
            unsafeWindow.scroll(0, 0);
        };

        popupMenu.onclick = function(e) {
            var elem = e.target;
            if (elem.classList.contains('account_name')) {
                copyAuthCode(elem);
            } else if (elem.classList.contains('remove_account')) {
                removeAccount(elem);
            } else if (elem.id == 'add_account') {
                showAddAccountDialog();
            } else if (elem.id == 'import_account') {
                showImportAccountDialog();
            }
        };

        buttons.style.marginTop = `calc(-${unsafeWindow.getComputedStyle(buttons).height} / 2)`;
    }

    function showAuthenticatorPopupMenu(elemLink) {
        var $Link = $JFromIDOrElement(elemLink);
        var $popup = $J('#SG_Authenticator_dropdown');

        if ($Link.hasClass('focus')) {
            HideMenu(elemLink, $popup);
            return;
        }

        ACCOUNTS = GM_getValue('SG_ACCOUNTS') || [];
        AUTOCODE = GM_getValue('SG_AUTO_INPUT_CODE') ?? true;
        ACCOUNTS_ALL = ACCOUNTS_GLOBAL.concat(ACCOUNTS);

        var popupMenu = document.querySelector('#SG_Authenticator_dropdown .popup_menu');
        var time = Date.now();
        popupMenu.setAttribute('data-time', time);

        var html = `<a class="popup_menu_item" id="add_account">添加账号</a>
                    <a class="popup_menu_item" id="import_account">导入账号</a>
                    <a class="popup_menu_item" id="auto_input_code" style="position: relative; padding: 0;">
                    <label for="auto_input_code_checkbox" style="cursor: pointer;">自动输入验证码</label>
                    <input id="auto_input_code_checkbox" type="checkbox" style="vertical-align: middle; right: 7.5px; margin: 0px;" ${AUTOCODE ? "checked=true" : ""}></a>`;

        for (var i=0; i<ACCOUNTS_GLOBAL.length; i++) {
            var account = ACCOUNTS_GLOBAL[i];
            html += `<a class="popup_menu_item" style="position: relative; padding: 0;">
                     <span class="account_name" data-tooltip-text="点击复制该账号的验证码" data-gid=${i} data-name=${account.account_name} data-time=${time}>${account.account_name}</span></a>`;
        }

        for (var i=0; i<ACCOUNTS.length; i++) {
            var account = ACCOUNTS[i];
            html += `<a class="popup_menu_item" style="position: relative; padding: 0;">
                     <span class="account_name" data-tooltip-text="点击复制该账号的验证码" data-id=${i} data-name=${account.account_name} data-time=${time}>${account.account_name}</span>
                     <span class="remove_account" data-tooltip-text="删除该账号" data-id=${i} data-name=${account.account_name}></span></a>`;
        }
        
        popupMenu.innerHTML = html;
        setupTooltips($J(popupMenu));

        popupMenu.querySelector('#auto_input_code_checkbox').onchange = function() {
            AUTOCODE = this.checked;
            GM_setValue('SG_AUTO_INPUT_CODE', AUTOCODE);
        };

        $popup.css('margin-top', `${-$popup.height() / 2}px`);
        ShowWithFade($popup);
        $Link.addClass('focus');
        RegisterPopupDismissal(function() { HideMenu(elemLink, $popup); }, $popup);
    }

    function showAddAccountDialog() {
        var content = `<div class="newmodal_prompt_description">Steam 帐号名称<span data-tooltip-text="非个人资料名称，用于自动填写 Steam 令牌验证码。"> (?)</span></div>
                    <div class="newmodal_prompt_input gray_bevel for_text_input fullwidth"><input type="text" id="account_name"></div>
                    <div class="newmodal_prompt_description" style="margin-top: 8px;">共享密钥<span data-tooltip-text="即 shared secret，用于生成 Steam 令牌验证码。"> (?)</span></div>
                    <div class="newmodal_prompt_input gray_bevel for_text_input fullwidth"><input type="text" id="shared_secret"></div>
                    <div class="newmodal_prompt_description" style="margin-top: 8px;">64 位 Steam ID<span data-tooltip-text="以“7656”开头的 17 位数字，用于确认交易和市场。"> (?)</span></div>
                    <div class="newmodal_prompt_input gray_bevel for_text_input fullwidth"><input type="text" id="steamid"></div>
                    <div class="newmodal_prompt_description" style="margin-top: 8px;">身份密钥<span data-tooltip-text="即 identity secret，用于确认交易和市场。"> (?)</span></div>
                    <div class="newmodal_prompt_input gray_bevel for_text_input fullwidth"><input type="text" id="identity_secret"></div>`;

        var modal = ShowConfirmDialog('添加账号', content, '确定', '取消');
        var $content = modal.GetContent();
        setupTooltips($content);
        modal.done(function() {
            var account = {
                account_name: $content.find('#account_name').val().trim() || 'unknown',
                shared_secret: $content.find('#shared_secret').val().trim(),
                steamid: $content.find('#steamid').val().trim(),
                identity_secret: $content.find('#identity_secret').val().trim()
            };
            appendAccount('添加账号', account);
        });
    }

    function showImportAccountDialog() {
        var modal = ShowPromptWithTextAreaDialog('导入账号', '', '确定', '取消');
        var $content = modal.GetContent();
        var $textarea = $content.find('textarea');
        $textarea.attr('placeholder', '将要导入的数据粘贴于此');
        modal.done(function(text) {
            try {
                var data = JSON.parse(text);
                var account = {
                    account_name: data.account_name || 'unknown',
                    shared_secret: data.shared_secret,
                    steamid: (data.steamid || data.Session?.SteamID || '').toString(),
                    identity_secret: data.identity_secret
                };
                appendAccount('导入账号', account);
            } catch(err) {
                ShowAlertDialog('错误', '数据格式有误，请检查后再试。', '确定');
            }
        });
    }

    function appendAccount(title, account) {
        if (!account.shared_secret) {
            ShowAlertDialog('错误', '缺少有效的共享密钥(shared_secret)。', '确定');
            return;
        }
        if (account.steamid && account.steamid.search(/^7656\d{13}$/) != 0) {
            ShowAlertDialog('错误', '无效的 64 位 Steam ID。', '确定');
            return;
        }
        ACCOUNTS.push(account);
        ACCOUNTS_ALL = ACCOUNTS_GLOBAL.concat(ACCOUNTS);
        GM_setValue('SG_ACCOUNTS', ACCOUNTS);
        if (account.steamid && account.identity_secret) {
            ShowAlertDialog(title, title + '成功，该账号支持确认交易和市场。', '确定');
        } else {
            ShowAlertDialog(title, title + '成功，该账号不支持确认交易和市场。', '确定');
        }
    }

    function showConfirmationDialog() {
        if (!userSteamID) {
            ShowAlertDialog('确认交易和市场', '当前页面不支持确认交易和市场。', '确定');
            return;
        }

        ACCOUNTS = GM_getValue('SG_ACCOUNTS') || [];
        ACCOUNTS_ALL = ACCOUNTS_GLOBAL.concat(ACCOUNTS);
        var account;
        for (var a of ACCOUNTS_ALL) {
            if (a.steamid == userSteamID && a.identity_secret) {
                account = a;
                break;
            }
        }
        if (!account) {
            ShowAlertDialog('确认交易和市场', '当前账号不支持确认交易和市场。', '确定');
            return;
        }
        var content = `<div id="confirmation_container" style="overflow: hidden; position: relative;">
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
        var modal = ShowDialog('确认交易和市场', content);

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
                unsafeWindow.open('https://steamcommunity.com/mobileconf/detailspage/' + cid + '?' + generateConfirmationQueryParams(account, 'details' + cid, timeOffset), '_blank', 'height=790,width=600,resize=yes,scrollbars=yes');
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

        $content.find('#accept_conf').on('click', function() {
            sendConfirmationData(account, 'allow', modal)
        });

        $content.find('#reject_conf').on('click', function() {
            sendConfirmationData(account, 'cancel', modal)
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
        ShowConfirmDialog('删除账号', `确定删除该账号 (${elem.getAttribute('data-name')}) 吗？`, '确定', '取消').done(function() {
            var index = elem.getAttribute('data-id');
            if (index >= ACCOUNTS.length) {
                ShowAlertDialog('错误', '无法删除该账户，请稍后再试。', '确定').done(function() {
                    unsafeWindow.location.reload();
                })
            } else {
                ACCOUNTS.splice(index, 1);
                ACCOUNTS_ALL = ACCOUNTS_GLOBAL.concat(ACCOUNTS);
                GM_setValue('SG_ACCOUNTS', ACCOUNTS);
                ShowAlertDialog('删除账号', '删除成功。', '确定');
            }
        }); 
    }

    async function copyAuthCode(elem) {
        let account;
        if (elem.hasAttribute('data-gid')) {
            account = ACCOUNTS_GLOBAL[elem.getAttribute('data-gid')];
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
        
        elem.style.with = unsafeWindow.getComputedStyle(elem).width;
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
    var reloadImg = `data:image/png;base64,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`;
    var topImg = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsQAAA7EAZUrDhsAAAwuSURBVHhe7Zt/cFTVFcfvfbtZliQEkERErc6oxVFHHPlRlNYqKiT7IwToFCuIlbESFTuOouiII4OtWlQcqcWCWFKKwsBUkGT37W4WTTs6DEbAP6SdWtuZqqXS+qsiIT/fu/2et4fLbt4GN8nuhnH6mdnsO2d377vn3HPPufe9F/F/hpBt27YNpxeLQ4LB70VFKSXjZmT5yBFl71fgRcek44+LypCcNBZtvFdKYzWLDkrZSwOhWc+wWDSK7oCkaU6xlPWGkHIYq1Io1Sk84vs1NbWtrCkKRZ0CyWRyZI+wt7iMJ6BTltiyc+fOUawpCkVzAM1xq6tzHULuAla5kFKe7x9Wsq6Y+aBoDohFo7dhwv2IxT6B5Tc0x/DdIlEUT0ej0Us9Uu3FYWlKwyh1xHmXssJ5P8ExQ8krZoZC77JcMAoeAYlEoswj1FYcphvfZdviJ5Vjx1XSC564lXSpjxxKbfyGfstywSi4A+yerjWIs0tYdMAMfzgYDv9m8uTJ3fSqCdZuVLb9MH+cAr9RNn5bYAo6BeLR6Hwh1Us4PHEeJczqYKgWCc9mjQMSn5Ewo034ZpBVhEIkLAwGa19mOe8ULAKam5q+jfH/NQ7TnXxIeksW9TaeIB19pvAdVhHSUOL55mZqqzAUxAENDQ1+2yOp3uvkhhHuwQLo5urq6v+wygV9Jg2xkL7LKvJMhdUtt7agTdbklYI4YNzYql/gbXJK0jweCtW9zsd9UlMTbjEM4zEWHaQUkzpPr1zFYl7JuwNikUgd3n6akhgl/ugvLf8ZS1+Lz1/6c7z9ISUxUt4VjTbOZilv5DUJJhsbz+nxyAOYz2NYRbH/iS09E4PB4D9ZkxOmaZ5tKOsADK9iFZoSn3l99sQZM2Z9yKpBkzcHrF+/vuTcb531Gg6vSmkcbGHIupqaUIRlTUtLg7+jreo6OvZ/8slr0xct6nA+SANVJIwqsguH6ZH6xgcfHbquvr6+m+VBkbcpcM7ZZ67AW7rxxLPZjN+xY8eYjvbKViS8CL06xla2JqHjjzU1IfzWVs+yeJyr+Fx5IS8OiMUi1yPsH2TRAeWsFcP/EIsa2ugM95e8KIW8lFUIQ3mp7fe9mG0TZBuehxD6GVtkOheiYwaLg2LQDohEImdIW/0Oh56UxjHyS9ltLcC872SVJhGL3gWDXckMDpsNozKTJ6A2lDTm4/C/KY0DzmVvonOzPGAG5YDt27d7vFL8FkMyjlVkPIbRqK+pq/sbqzSJSGQSPn6SRTeGWEXfYUkDJ/wda8LbqW1WURiMwwZrE/WBNQNiUA6oKC+9H/FbzaIDYngD5u42FjXI6hW2obYgfPtc0OC3foXv0HdZpakJzaI2N6SkFGhr5oiy4ctYHBADdkA8HpmGAXmURUa922Wpe1jQUFAY0lqL0B/PqpMgx0tlP0+/YYWmG20rnIPF46zEdvu7fNxvBlQG4/H4acruPgCDzmUVGdkmDHtqIFD3J1ZpMLcXoZxtZDFH1K20S2RBE4vtugSZ8S2Mvt4qwykftHd0T5o7d+5nrMqZfkeAMzJ294Z04wlDyruzGW+ar14M43/JYj+QazAVLmZBQ+dAF+5m0YH6UjrMtyFb1Hwd/XZAwowswSnnsuiAEdhSHQy7RquxsbHUUB66GFKe0vSLckPZW6kNljXBcHijVCJziyzFnBgqDEs50y8HJE3zcqThp1h0QF5+XwnPHXSY0pzA55HPIFNNYLH/SDHB5/Vku1egLGncibe/suwgUWFiscaJLOZEzg54881XR2A7uzUjiyvVaQs5H2UqdW0vDWyK5sEji1kcMErZi7EJuoFFDZ1TeuR86gOrqCr4pW1krSJ9kasD5NEjnrU4w4UsO8DAB0Kh0D4WNclI5DyM3np0aEBJNh1qwyONdTDqfFZpqqvD+1FeMsugFBdKZa11jnIgJwdgqftjtLeQRQdbica9rfueY1Fz8OB2X49T70U+b3CMMoT18sGDB30sa/bsfftXGAraMGngs5vi0cZbWDwpX+ul5kjkIkuKVhikExlG/kNvyTBsS2e4yk7MjDyNRpeymFdw3tWBYPg+FjXJZHJMT1cntuHiHFbRd48q0TM1GJz9Z1Zl5aQRsGfPnuEwHvM+I4t3I9vclNX4SCSEOelaCOUNtI1oDLGkcfpiq5twqLfIGIRyKbxbslWRdE7qgC+/+Hw1jL+MxeOsDARq3+Bjze7dTWdJqRoQfjkn1v5CbWPj1YB8cDarNIFap08rU1IKOOEynzfzLnRv+uwsPP1DuPx2FlMotfvI0WN0vS+DlpYWb3eX2Iwe6qs3BQPnwPpgM52TNRrqG0I/yaIDFkf1zY4t2cnqAGwzz0NN7ZXF1WFleG+eN2+exQpNZ3vbcqzGprNYeKS4puPY0cwbKcDpm/QgYavDrKKokZatXnAqUxZcDsD20octLlZZcjSrCAuLzFsCgcDHLGuSsaZr4GVXZ4rA8ngk4nI69VFZgiqAHij4YBRVpoOwjVUalwOwvXwMHr6CRQc08BTmfYJFDeZilWXLzfjcFY6Fhs6pDLE5kXjldFZpkA8SGJSMFSsidOohsq0XGQ4wzSa6LXVvSkqBdf6eMVVjH2FRs2LFCsNQVgNadiWkYoH5eZayfBupL6zSVI0d9wicsIdFBxu2NZtm+q23Ew5oakIWVzIji6OBz4XsWUA3MFmlufI7k+/BMLhKUvGRoSunTskYNMLps9GzwLGBIdssYTdQxWJVygGUUb0IJ6Q8HU74ocIe97ZAYM4/WKVBkpyKbPs4i0MOuvpYAn1iUeP0XcnbHFsYRM3pVLGOVxHHAe1tXy2HdzITipRrA4HwDpY0LTt3jvKkLm25EspQQX2hS2kwyrX8DoRhA2xh0YEqFlUuOjYwJ65GA5lZXKl3/MPL7mdJA0fKTp93PRrIWlKGFnleZ/vR9dRHVmjIFujfYdEB8sOm2Xi1YSkbq70TWRyx8hXq/Y3Tp09336mJRxfDm/NYPAWR85w+9sKxBTaRbayiqMGsl/dgCqj0baZCfCxBLX2PZY1p7poglSj6g4z9hfqI8uy6COPYZIslONT5AAcXGUh8zSwDtQnzfjMLGiyOyqUyej/nc6pSivK8lfrMsgb5ALapTSzCWfIvhqej+07kyN/DG/uHDS933ZkhRpaVrkHIuC5QnrKgr9RnljIgG2HvfiSBHUaJ7w6dMGgxsXLlStejK3GzaQFapKhwJZdTHdsWC4PhMD2jlEG6rSc1KhqNjvcI+214NOdrbKcUSh2xhDElFAplXDxNR6/6eoOa6vdKlfGcT15R4mOUoodw8CBC8l+szS/oOz2jSLawxkWfDuhsP7YKecF1ozIPvK+UfUfF6NPOD4Rqn6gJ1q46crTtAsRjPfYdfY7UgJFiIrbOfd6QzToF4tHobCXsHUh8eZv3lGSlsp8aVjriFdTlE0+BpUHL0462tjk4K910ncLqQYNIo+XRD4LB2p2s0rgMxDr/XI+BzgrhemKjv9B5cYYWjOyqt97avztbks0GdReDcJ1hiGW2UvTwRT4G4rMeW0wKh8MfsOyQ0fC+fftKPv334deh/R6rBgRG28LfV6UlnqypHdw/QCART8Y8XgYnIjIGed1Bijcrq864Nn13m+GAuBmhCwaux1pyBSPXgZXYS8rjfTrbanIwUEUyhL0UTqD7E4P5RyvknbC2UTsAa+gZwlYxHPb7iQsY/iVG/QWfLdZcX1ub/qhr3onFYuOEbdHd4XpMjIHcfLFsYQeDwVnOCthxAD1r45XiACT9qEtOUCkT6jlLyXWYW1+wtijQtrzD71uMQbsbjjiT1TmBPh/22/Ly6eHwYUnP2FSUlZowfiZ/ngtUyp4ZObpy07Rp09pZNyTQ/x2OKCtbKA21FNv0HJ5ASaFslfzqWHuA/n+PbjVlXEDsi1xK2VDhlNCOtjmYj8vgiN7PKWcFpXEZyk3TR1gx9Xlhk0oZGnxdeOSq6urgbiQh+OHUhbqbMM3rcfQAQv3ak5ZQpT6WMTNyCN9wzSE01INpsSsfpWyoMM3GKYYy7u+rhGKV8ilNAXrC84mUyjG8AxGxWUjP6nyXsqEiiRLaI637EPML4Qi9L4Ctj0oOmRuxeayD4e8ZXt+6mTNnFmZzMsQ0Nzefafd0LUFETBDK2LW3tbWfT6594xDif36T2Z5aHHU9AAAAAElFTkSuQmCC`;

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
        #SG_Authenticator_dropdown .account_name, #auto_input_code label {
            display: block; 
            padding: 5px 0 5px 12px; 
            margin-right: 27px; 
            min-width: 50px;
        }
        #SG_Authenticator_dropdown .remove_account, #auto_input_code input {
            position: absolute;
            right: 0;
            top: 0;
            padding: 0 7.5px;
            width: 12px;
            height: 100%;
            background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAQAAAD8fJRsAAAAkElEQVR4AXWQxWEDMRBFJ6AWArqGmW7G12HMDN0ZFmr4dqKF00rDPGPhycnr/vi9nJVPl2qI7Dd0WZpZEyFEygKhy1CkPsX4JCLlB6OP6jo3eRHxhh3xA+OBLULedCtExDOGcRvM6DZzpP/RxgtR4fDKat/ylPUKpZwao1A769VBDbls3H5WO6KfjVu5YOVJDkyDcoTnvnKRAAAAAElFTkSuQmCC);
            background-position: center;
            background-repeat: no-repeat;
            background-origin: content-box;
            cursor: pointer;
        }
        .copy_code_success {
            color: #57cbde !important;
        }
        .show_auth_code {
            background: linear-gradient(#1a73e8cc, #1a73e8cc) no-repeat;
        }
        #SG_Authenticator_dropdown .popup_menu_item {
            font-size: 12px;
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
    `;
    
	steamGuardAuthenticatorButtons();

    var intersectionObserver = new IntersectionObserver(function(entries) {
        if (entries[0].intersectionRatio > 0) {
            var name = $J('#login_twofactorauth_message_entercode_accountname, [class^="login_SigningInAccountName"], [class^="newlogindialog_AccountName"]').text();
            $J.each(ACCOUNTS_ALL, function(i, v) {
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

})();