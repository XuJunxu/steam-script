// ==UserScript==
// @name         Steam功能和界面优化
// @namespace    https://github.com/XuJunxu/steam-script
// @version      2.3.6
// @description  Steam功能和界面优化
// @author       Nin9
// @iconURL      https://store.steampowered.com/favicon.ico
// @updateURL    https://github.com/XuJunxu/steam-script/raw/master/SteamFunctionAndUiOptimization.js
// @downloadURL  https://github.com/XuJunxu/steam-script/raw/master/SteamFunctionAndUiOptimization.js
// @match        http*://store.steampowered.com/search*
// @match        http*://store.steampowered.com/wishlist/*
// @match        http*://store.steampowered.com/app/*
// @match        http*://store.steampowered.com/explore*
// @match        http*://steamcommunity.com/tradeoffer/*
// @match        http*://steamcommunity.com/id/*/inventory*
// @match        http*://steamcommunity.com/profiles/*/inventory*
// @match        http*://steamcommunity.com/market*
// @match        http*://steamcommunity.com/id/*/gamecards/*
// @match        http*://steamcommunity.com/profiles/*/gamecards/*
// @match        http*://store.steampowered.com/account/history*
// @match        http*://steamcommunity.com/sharedfiles/filedetails*
// @match        http*://steamcommunity.com/workshop/filedetails*
// @require      https://cdn.bootcdn.net/ajax/libs/localforage/1.7.1/localforage.min.js
// @grant        unsafeWindow
// ==/UserScript==

(function() {
	'use strict';
	
	if (typeof unsafeWindow.sfu_inited !== "undefined") {
		return;
	}
	unsafeWindow.sfu_inited = true;
		
	const TIMEOUT = 20000;
	var globalSettings, globalCurrencyRate;

	//修复创意工坊预览大图无法显示的问题
	function steamWorkshopImageRepair() {
		if (!location.href.match(/^https?\:\/\/steamcommunity\.com\/(sharedfiles|workshop)\/filedetails\b/)) {
			return;
		}

		if(typeof onYouTubeIframeAPIReady == 'function') {
			onYouTubeIframeAPIReady();
		}
	}

	//消费记录页面
	function steamAccountHistory() {
		if (!location.href.match(/^https?\:\/\/store\.steampowered\.com\/account\/history\b/)) {
			return;
		}

		addStoreSettings();

		if (globalSettings.history_append_filter || globalSettings.history_change_onclick) {
			var loading = document.querySelector("#wallet_history_loading");
			var pageContent = document.querySelector(".page_header_ctn .page_content");
			pageContent.insertBefore(loading, pageContent.querySelector(".pageheader"));
			loading.style.float = "right";
			waitLoadingAllHistory();
		}

		if (globalSettings.history_change_onclick) {
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `td.wht_items, td.wht_date {cursor: auto;}`;
			document.body.appendChild(styleElem);

			document.querySelector(".wallet_history_table tbody").addEventListener("click", function(event) {
				var elem = event.target;
				if (elem.classList.contains("wht_date") || elem.classList.contains("wht_items") || elem.parentNode.classList.contains("wht_date") || elem.parentNode.classList.contains("wht_items")) {
					event.stopPropagation();
				}
			}, true);
		}

		function waitLoadingAllHistory(times=0) {
			var loadButton = document.querySelector("#load_more_button");
			if (loadButton.style.display != "none") {
				times = 0;
				loadButton.click();
			}

			setTimeout(function() {
				var button = document.querySelector("#load_more_button");
				var loading = document.querySelector("#wallet_history_loading");
				if (button.style.display == "none" && loading.style.display == "none") {
					ComputeAndModifyHistory();
					return;
				}
				
				times++;
				if (times < 150) {
					waitLoadingAllHistory(times);
				}
			}, 200);
		}

		function ComputeAndModifyHistory() {
			var walletHistory = document.querySelectorAll("tr.wallet_table_row");
			if (walletHistory.length > 0) {
				var currencyInfo = getCurrencyInfo(globalSettings.history_currency_code);
				var currencySymbol = currencyInfo.strSymbol;

				var transactionTypes = {};
				var allMarketTransaction = {increase: 0, decrease: 0, typeName: new Set()};
				var allPurchase = {
					purchase: {total: 0, typeName: "", transid: []},
					giftPurchase: {total: 0, typeName: "", transid: []},
					inGamePurchase: {total: 0, typeName: "", transid: []},
					refund: {total: 0, typeName: "", transid: []}
				};
				var allTransaction = {};

				for (var index=walletHistory.length-1; index >= 0; index--) {
					var row = walletHistory[index];
					var wht_items = row.querySelector("td.wht_items")?.textContent.trim() ?? "unknow";
					var wht_type = row.querySelector("td.wht_type > div:first-child")?.textContent.replace(/\d/g, "").trim() ?? "";
					var url = row.getAttribute("onclick")?.match(/location.href='(.+)'/)?.[1] ?? "";
					var wht_total = getPriceFromSymbolStr(row.querySelector("td.wht_total")?.textContent ?? "");
					var wht_wallet_change = row.querySelector("td.wht_wallet_change")?.textContent.trim() ?? "";

					//《兑换数字礼物卡》则wht_type中没有textContent
					//《市场交易出现待处理》则wht_wallet_change为null
					// 退款可能没有总计金额
					// 游戏内购买不增加礼物额度
					if (wht_type && (row.querySelector("td.wht_total")?.textContent.includes(currencySymbol) || !row.querySelector("td.wht_total")?.textContent.trim()) && url) {
						if (url.includes("steamcommunity.com/market/#myhistory")) {  //市场交易
							if (wht_wallet_change[0] == "-") {
								allMarketTransaction.decrease += wht_total;
							} else if (wht_wallet_change[0] == "+") {
								allMarketTransaction.increase += wht_total;
							}
							allMarketTransaction.typeName.add(wht_type);
						} else if (url.includes("HelpWithItemPurchase")) {  //游戏内购买
							var transid = url.match(/\btransid=(\d+)/)[1];
							if (allPurchase.inGamePurchase.transid.includes(transid)) {
								allPurchase.inGamePurchase.total -= (wht_total || allTransaction[transid]);
								allPurchase.refund.total += (wht_total || allTransaction[transid]);
								allPurchase.refund.typeName = wht_type;
								allPurchase.refund.transid.push(transid);
							} else {
								allPurchase.inGamePurchase.total += wht_total;
								allPurchase.inGamePurchase.typeName = wht_type;
								allPurchase.inGamePurchase.transid.push(transid);
								allTransaction[transid] = wht_total;
							}												
						} else if (url.includes("HelpWithTransaction")) {  //商店购买和礼物购买
							var transid = url.match(/\btransid=(\d+)/)[1];
							if (allPurchase.giftPurchase.transid.includes(transid)) {
								allPurchase.giftPurchase.total -= (wht_total || allTransaction[transid]);
								allPurchase.refund.total += (wht_total || allTransaction[transid]);
								allPurchase.refund.typeName = wht_type;
								allPurchase.refund.transid.push(transid);
							} else if (allPurchase.purchase.transid.includes(transid)) {
								allPurchase.purchase.total -= (wht_total || allTransaction[transid]);
								allPurchase.refund.total += (wht_total || allTransaction[transid]);
								allPurchase.refund.typeName = wht_type;
								allPurchase.refund.transid.push(transid);
							} else if (row.querySelector("td.wht_items .wth_payment a")?.hasAttribute("data-miniprofile")) {  //礼物购买
								allPurchase.giftPurchase.total += wht_total;
								allPurchase.giftPurchase.typeName = wht_type;
								allPurchase.giftPurchase.transid.push(transid);
								allTransaction[transid] = wht_total;
							} else {
								allPurchase.purchase.total += wht_total;
								allPurchase.purchase.typeName = wht_type;
								allPurchase.purchase.transid.push(transid);
								allTransaction[transid] = wht_total;
							}
						}
					}

					wht_type = wht_type || wht_items;
					transactionTypes[wht_type] = (transactionTypes[wht_type] || 0) + 1;
					row.setAttribute("transaction-type", wht_type);
					row.style.display = null;

					if (globalSettings.history_change_onclick && url) {
						var wht_date = row.querySelector("td.wht_date");
						wht_date.innerHTML = `<a href="${url}" target="_blank">${wht_date.innerHTML}</a>`;
					}
				}
				if (globalSettings.history_append_filter) {
					showFilterAndStatistics(allPurchase, allMarketTransaction, transactionTypes, currencyInfo);
				}
			}
		}

		function showFilterAndStatistics(allPurchase, allMarketTransaction, transactionTypes, currencyInfo) {
			var filtElem = document.createElement("style");
			document.body.appendChild(filtElem);

			var transactionCount = 0;
			for (var name of allMarketTransaction.typeName) {
				transactionCount += transactionTypes[name];
				delete transactionTypes[name];
			}
			
			var transactionTypesData = {};
			for (var name in transactionTypes) {
				transactionTypesData[name] = name;
			}

			var marketTransName = Array.from(allMarketTransaction.typeName);
			marketTransName.sort((a, b) => { return a.localeCompare(b); });

			var transTypeArray = Object.keys(transactionTypes);
			transTypeArray.sort((a, b) => { return a.localeCompare(b); });

			if (marketTransName.length > 0) {
				transTypeArray.push(marketTransName[0]);
				transactionTypes[marketTransName[0]] = transactionCount;
				transactionTypesData[marketTransName[0]] = marketTransName.join(",");
			}


			var checkboxElems = "";
			for (var i=0; i < transTypeArray.length; i++) {
				var typeName = transTypeArray[i];
				checkboxElems += `<span><input id="trans_type_${i}" type="checkbox" transaction-type="${transactionTypesData[typeName]}" class="trans_type_filter_box">
								<label for="trans_type_${i}" class="trans_type_filter_label">${typeName} (${transactionTypes[typeName]})</label></span>`;
			}

			var statisticsContent = `<span>剩余额度：${getSymbolStrFromPrice((allPurchase.purchase.total - allPurchase.giftPurchase.total), currencyInfo)}</span>
									<span>商店购买：${getSymbolStrFromPrice(allPurchase.purchase.total, currencyInfo)}</span>
									<span>礼物购买：${getSymbolStrFromPrice(allPurchase.giftPurchase.total, currencyInfo)}</span>
									<span>游戏内购买：${getSymbolStrFromPrice(allPurchase.inGamePurchase.total, currencyInfo)}</span>
									<span>市场购买：${getSymbolStrFromPrice(allMarketTransaction.decrease, currencyInfo)}</span>
									<span>市场出售：${getSymbolStrFromPrice(allMarketTransaction.increase, currencyInfo)}</span>`;
			
			var bar = document.createElement("div");
			bar.id = "history_filter_bar";
			bar.innerHTML = `<div id="purchase_statistics">${statisticsContent}</div>
							<div id="transaction_type_filter"><span class="filter_hint">交易类型：</span>${checkboxElems}</div>
							<style>
							#history_filter_bar {margin: 0 0 10px 5px; line-height: 24px;}
							#purchase_statistics span {margin-right: 20px; white-space: nowrap;}
							.wallet_history_click_hint {display: none;}
							#transaction_type_filter {line-height: 24px; user-select: none;}
							#transaction_type_filter span {white-space: nowrap;}
							.trans_type_filter_box {cursor: pointer; vertical-align: middle;}
							.trans_type_filter_label {cursor: pointer; margin-right: 20px; }
							</style>`;
			document.querySelector("#main_content").insertBefore(bar, document.querySelector(".wallet_history_click_hint"));

			document.querySelector("#transaction_type_filter").onclick = function(event) {
				var checkboxList = document.querySelectorAll("#transaction_type_filter input");
				var uncheckedTypes = [];
				var checkedCount = 0;
				for (var box of checkboxList) {
					if (!box.checked) {
						var transTypes = box.getAttribute("transaction-type");
						for (var typeName of transTypes.split(",")) {
							uncheckedTypes.push(`tr.wallet_table_row[transaction-type="${typeName}"]`);
						}
					} else {
						checkedCount++;
					}
				}
				if (uncheckedTypes.length > 0 && checkedCount > 0) {
					filtElem.innerHTML = `${uncheckedTypes.join(",")} {display: none;}`;
				} else {
					filtElem.innerHTML = "";
				}
			};
		}
	}

	//steam商店搜索页面
	function steamStorePage() {  
		if(!location.href.match(/^https?\:\/\/store\.steampowered\.com\/search\b/)) {
			return;
		}

		var appid, title, price;
		addStoreSettings();

		if (globalSettings.search_click_picture || globalSettings.search_click_price || globalSettings.search_click_title) {
			handleSearchResult();
		}
		
		//搜索结果排序和过滤
		if (globalSettings.search_set_filter) {
			filterSearchResult();
		}

		function handleSearchResult() {
			if (globalSettings.search_click_title) {
				var styleElem = document.createElement("style");
				styleElem.innerHTML = "span.title { user-select:all; cursor:text; }";
				document.body.appendChild(styleElem);
			}
			document.querySelector("div#search_results").addEventListener("click", searchResultClicked);
		}

		//搜索结果排序和过滤
		function filterSearchResult() {  
			var searchWord = document.querySelector("input#term").value;
			if (searchWord == "" || searchWord == "输入搜索词或标签") {
				var flag = false;

				//价格从低到高
				if (document.querySelector("input#sort_by").value != "Price_ASC") {  
					document.querySelector("input#sort_by").value = "Price_ASC";
					document.querySelector("a#sort_by_trigger").innerHTML = document.querySelector("a#Price_ASC").innerHTML;
					flag = true;
					//console.log("price ASC");
				}
		
				//价格范围
				if (document.querySelector("input#price_range").value != "1") {  
					document.querySelector("input#price_range").value = "1";
					document.querySelector("input#maxprice_input").value = rgPriceStopData[1].price;
					document.querySelector("div#price_range_display").textContent = rgPriceStopData[1].label;
					flag = true;
					//console.log("price range");
				}
		
				//隐藏免费开玩
				if (document.querySelector("input#hidef2p").value != "1") {   
					document.querySelector("input#hidef2p").value = "1";
					document.querySelector("div.tab_filter_control_row[data-param='hidef2p']").classList.add("checked");
					document.querySelector("span.tab_filter_control_include[data-param='hidef2p']").classList.add("checked");
					flag = true;
					//console.log("hidef2p")
				}
		
				//只搜索游戏
				if (document.querySelector("div#narrow_category1 input#category1").value != "998") {  
					document.querySelector("div#narrow_category1 input#category1").value = "998";
					document.querySelector("div#narrow_category1 div.tab_filter_control_row[data-value='998']").classList.add("checked");
					document.querySelector("div#narrow_category1 span.tab_filter_control.tab_filter_control_include[data-value='998']").classList.add("checked");
					flag = true;
					//console.log("game only");
				}
		
				//只搜索有卡牌
				if (document.querySelector("div#narrow_category2 input#category2").value != "29") {  
					document.querySelector("div#narrow_category2 input#category2").value = "29";
					document.querySelector("div#narrow_category2 div.tab_filter_control_row[data-value='29']").classList.add("checked");
					document.querySelector("div#narrow_category2 span.tab_filter_control.tab_filter_control_include[data-value='29']").classList.add("checked");
					flag = true;
					//console.log("has card");
				}

				//不限制语言
				if  (document.querySelector("div#LanguageFilter_Container input#supportedlang").value) {
					document.querySelector("div#LanguageFilter_Container input#supportedlang").value = null;
					for (var elem of document.querySelectorAll("div#LanguageFilter_Container>div.tab_filter_control_row ")) {
						elem.classList.remove("checked");
						elem.querySelector("span.tab_filter_control.tab_filter_control_include").classList.remove("checked");
					}
				}
		
				if (flag) {
					unsafeWindow.AjaxSearchResults();
				}
			}
		}

		function searchResultClicked(event) {
			var elem = event.target;
			if (globalSettings.search_click_title && elem.classList.contains("title")) {  //点击游戏名时选中并自动复制
				event.preventDefault();
				document.execCommand("Copy"); 
			} else if (globalSettings.search_click_picture && (elem.classList.contains("search_capsule") || elem.parentNode.classList.contains("search_capsule"))) {  //点击游戏图片时打开徽章页
				event.preventDefault();
				var aid = getAppid(elem, event.currentTarget, "search_result_row", "data-ds-appid");
				if (aid) {
					var url = `https://steamcommunity.com/my/gamecards/${aid}/`; 
					var win = window.open(url);
				}
			} else if (globalSettings.search_click_price && (elem.classList.contains("search_discount_block") || elem.parentNode.classList.contains("search_discount_block") || elem.parentNode.parentNode.classList.contains("search_discount_block"))) {  //点击游戏价格时添加到购物车
				event.preventDefault();
				appid = getAppid(elem, event.currentTarget, "search_result_row", "data-ds-appid");
				title = getTitle(elem, event.currentTarget);
				price = getPrice(elem, event.currentTarget);
				autoAddToCart();
			}
		}

		function getTitle(elem, stopElem) {
			var el = elem;
			while(el != stopElem && el != document.body) {
				if(el.classList.contains("search_result_row")) {
					return el.querySelector("span.title").textContent.trim().toLowerCase();
				}
				el = el.parentNode;
			}
			return null;
		}

		function getPrice(elem, stopElem) {
			var el = elem;
			while(el != stopElem && el != document.body) {
				if(el.classList.contains("search_result_row")) {
					return getPriceFromSymbolStr(el.querySelector("div.discount_final_price").textContent);
				}
				el = el.parentNode;
			}
			return null;
		}

		function autoAddToCart() {  //自动添加到购物车
			if (appid && title && price) {
				var win = unsafeWindow.open(`https://store.steampowered.com/app/${appid}/?l=english`, "_blank", "width=800, height=800");
				win.addEventListener("DOMContentLoaded", function() {
					var elems = win.document.querySelectorAll("div.game_area_purchase_game");
					for (var el of elems) {
						if(el.id) {
							var gameName = el.querySelector("h1").textContent.replace("Buy", "").trim().toLowerCase();
							var priceNode = el.querySelector("div.discount_final_price") || el.querySelector("div.game_purchase_price");
							var gamePrice = priceNode ? getPriceFromSymbolStr(priceNode.textContent) : 0;
							var subid = el.id.match(/add_to_cart_(\d+)$/);
							if (gameName == title && subid && subid.length > 1 && gamePrice == price) {
								el.querySelector("#btn_add_to_cart_" + subid[1]).click();
								break;
							}
						}
					}
				});
			}
		}
	}

	//愿望单页面
	function steamWishlistPage() {
		if(!location.href.match(/^https?\:\/\/store\.steampowered\.com\/wishlist\b/)) {
			return;
		}

		addStoreSettings();

		if (globalSettings.wishlist_click_picture || globalSettings.wishlist_click_price || globalSettings.wishlist_click_title) {
			handleWishlist();
		}

		function handleWishlist() {
			var styleElem = document.createElement("style");
			var html = "";
			if (globalSettings.wishlist_click_title) {
				html += "a.title {user-select:all; cursor:text; }";
			}
			if (globalSettings.wishlist_click_price) {
				html += "div.discount_prices{ cursor:pointer; }";
			}
			styleElem.innerHTML = html;
			document.body.appendChild(styleElem);
			document.querySelector("div#wishlist_ctn").addEventListener("click", wishlistClicked);
		}

		function wishlistClicked(event) {
			var elem = event.target;
			var aid = getAppid(elem, event.currentTarget, "wishlist_row", "data-app-id");
			if (globalSettings.wishlist_click_title && elem.classList.contains("title")) {
				event.preventDefault();
				document.execCommand("Copy"); 
			} else if (globalSettings.wishlist_click_price && (elem.classList.contains("discount_prices") || elem.parentNode.classList.contains("discount_prices"))) {
				window.open(`https://store.steampowered.com/app/${aid}/`);
			} else if (globalSettings.wishlist_click_picture && elem.parentNode.classList.contains("screenshots")) {
				event.preventDefault();
				window.open(`https://steamcommunity.com/my/gamecards/${aid}/`);
			}
		}
	}

	//app页面
	function steamAppStorePage() {
		if(!location.href.match(/^https?\:\/\/store\.steampowered\.com\/app\b/)) {
			return;
		}

		var elems = document.querySelectorAll("#category_block a");
		for (var el of elems) {
			if (el.href.search(/search\/?\?category2\=29/) > 0) {
				var appid = location.href.match(/store\.steampowered\.com\/app\/(\d+)/)[1];
				el.href = `https://steamcommunity.com/my/gamecards/${appid}/`;
				el.setAttribute("target", "_blank");
				break;
			}
		}
	}

	//探索队列界面
	function steamExplorePage() {
		if(!location.href.match(/^https?\:\/\/store\.steampowered\.com\/explore\b/)) {
			return;
		}

		var exploreBtn = document.createElement('div');
		exploreBtn.className = 'btnv6_blue_hoverfade btn_medium auto_explore_btn';
		exploreBtn.innerHTML = '<span>自动探索队列</span>';
		exploreBtn.id = "auto_explore_queue";
		exploreBtn.style = 'float: right;';
		exploreBtn.onclick = autoExploreQueue;

		var header = document.querySelector('div.header_area');
		header.insertBefore(exploreBtn, header.firstElementChild);

		async function autoExploreQueue() {
			exploreBtn.onclick = null;
			exploreBtn.className = 'discovery_queue_customize_ctn auto_explore_btn';
			exploreBtn.style = 'float: right; margin-bottom: 0; padding: 0 15px; line-height: 32px;';
			exploreBtn.innerHTML = '<span>生成新的队列...</span>';
			var sessionid = unsafeWindow.g_sessionID;
			var result = await generateNewDiscoveryQueue(sessionid, 0);
			if (result.success) {
				exploreApps(0, result.data.queue); 
			} else {
				exploreBtn.innerHTML = '<span>生成新的队列失败，将在5秒内重试...</span>';
				setTimeout(autoExploreQueue, 5000);
			}
		}

		async function exploreApps(start, queue) {
			for (let i=start; i<queue.length; i++) {
				exploreBtn.innerHTML = `<span>探索队列中：${i + 1}/${queue.length}</span>`;
				let appid = queue[i];
				let res = await clearFromQueue(unsafeWindow.g_sessionID, appid);
				if (!res.success) {
					exploreBtn.innerHTML = '<span>探索队列失败，将在5秒内重试...</span>';
					setTimeout(function() { exploreApps(i, queue); }, 5000);
					return;
				}
			}
			exploreBtn.innerHTML = '<span>探索队列完成</span>';
		}

		function generateNewDiscoveryQueue(sessionid, queuetype) {
			return new Promise(function(resolve, reject) {
				var url = "https://store.steampowered.com/explore/generatenewdiscoveryqueue";
				var xhr = new XMLHttpRequest();
				xhr.timeout = TIMEOUT;
				xhr.open("POST", url, true);
				xhr.setRequestHeader("content-type", "application/x-www-form-urlencoded");
				xhr.onload = function(e) {
					if (e.target.status == 200) {
						resolve({success: true, data: JSON.parse(e.target.response)});
					} else {
						console.log("generateNewDiscoveryQueue failed");
						resolve(e.target);
					}
				};
				xhr.onerror = function(error) {
					console.log("generateNewDiscoveryQueue error");
					resolve(error);
				};
				xhr.ontimeout = function() {
					console.log("generateNewDiscoveryQueue timeout");
					resolve({status: 408});
				};
				xhr.send(`sessionid=${sessionid}&queuetype=${queuetype}`);
			});
		}

		function clearFromQueue(sessionid, appid) {
			return new Promise(function(resolve, reject) {
				var url = "https://store.steampowered.com/app/20";
				var xhr = new XMLHttpRequest();
				xhr.timeout = TIMEOUT;
				xhr.open("POST", url, true);
				xhr.setRequestHeader("content-type", "application/x-www-form-urlencoded");
				xhr.onload = function(e) {
					if (e.target.status == 200) {
						resolve({success: true});
					} else {
						console.log("clearFromQueue failed");
						resolve(e.target);
					}
				};
				xhr.onerror = function(error) {
					console.log("clearFromQueue error");
					resolve(error);
				};
				xhr.ontimeout = function() {
					console.log("clearFromQueue timeout");
					resolve({status: 408});
				};
				xhr.send(`sessionid=${sessionid}&appid_to_clear_from_queue=${appid}`);
			});
		}

	}

	//创建交易报价页面
	function steamTradeOfferPage() {
		if(!location.href.match(/^https?\:\/\/steamcommunity\.com\/tradeoffer\b/)) {
			return;
		}

		appendPageControl();
		var activeInventoryAppid = null;
		var activeInventoryContextid = null;
		var activeInventoryOwner = null;

		var styleElem = document.createElement("style");
		styleElem.innerHTML = `#inventory_displaycontrols {display: none;} .btn_move_items {padding: 3px 15px; margin: 0 5px 0 0;} 
							   .custom_container select, .custom_container input {max-width: 380px; padding: 2px 0 2px 4px; margin: 8px 0 0 4px; color: #EEEEEE;}
							   .custom_container option {background-color: #181818} .trade_offer_buttons {margin: 8px 0 0 0;}
							   .trade_add_buttons {margin: -10px 0 8px 0;}`;
		document.body.appendChild(styleElem);

		var tradeButtons = document.createElement("div");
		tradeButtons.className = "trade_add_buttons";
		tradeButtons.innerHTML = `<a class="btn_add_all btn_move_items btn_green_white_innerfade" title="将当前库存中全部物品（可设置筛选条件）添加到交易报价中">添加全部物品</a>
								  <a class="btn_add_current btn_move_items btn_green_white_innerfade" title="将当前页显示的物品添加到交易报价中">添加当前页物品</a>
								  <input type="checkbox" id="include_stackable_item" style="margin: 3px;"><label for="include_stackable_item">包含堆叠的物品</label>`;
		var filters = document.querySelector("#nonresponsivetrade_itemfilters");
		filters.insertBefore(tradeButtons, filters.querySelector(".filter_ctn"));
		tradeButtons.onclick = optButtonClicked;

		var customContainer = document.createElement("div");
		customContainer.className = "custom_container";
		customContainer.innerHTML = `<div style="height: 1px; background: #000000; border-bottom: 1px solid #2B2B2B; margin: 10px 0 8px 0;"></div>
									 <div><a class="btn_add_custom btn_move_items btn_green_white_innerfade" title="根据下面的设置将物品添加到交易报价中">添加以下设置的物品</a></div>
									 <div><span>游戏</span><select id="select_game_to_trade"></select><br>
									 <span>物品</span><select id="select_item_class_to_trade"></select>
									 <span style="margin-left: 18px;">数量</span><input id="input_quantity_to_trade" type="number" min="1" step="1" placeholder="全部" style="width: 70px;">
									 <select id="select_quantity_unit"></select></div>`;
		filters.parentNode.appendChild(customContainer);
		customContainer.onclick = optButtonClicked;

		var html = `<a class="btn_remove_all btn_move_items btn_green_white_innerfade">移除全部物品</a>`;
		var trade_yours = document.createElement("div");
		trade_yours.innerHTML = html;
		trade_yours.className = "trade_offer_buttons trade_yours_bottons";
		document.querySelector("#trade_yours .offerheader").appendChild(trade_yours);

		var trade_theirs = document.createElement("div");
		trade_theirs.innerHTML = html;
		trade_theirs.className = "trade_offer_buttons trade_theirs_bottons";
		document.querySelector("#trade_theirs .offerheader").appendChild(trade_theirs);
		
		trade_yours.onclick = removeAllItems;
		trade_theirs.onclick = removeAllItems;

		document.querySelector("#inventories").onclick = itemClicked;
		document.querySelector("#your_slots").onclick = itemClicked;
		document.querySelector("#their_slots").onclick = itemClicked;

		document.querySelector("#appselect_you_options").onclick = waitLoadInventory;
		document.querySelector("#appselect_them_options").onclick = waitLoadInventory;
		document.querySelector("#inventory_select_your_inventory").onclick = waitLoadInventory;
		document.querySelector("#inventory_select_their_inventory").onclick = waitLoadInventory;
		waitLoadInventory();

		function waitLoadInventory() {  
			customContainer.style.display = "none";
			if (!unsafeWindow.g_ActiveInventory) {
				return;
			}

			if (!unsafeWindow.g_ActiveInventory.appid || unsafeWindow.g_ActiveInventory.BIsPendingInventory()) {
				setTimeout(function() {
					waitLoadInventory();
				}, 100);
				return;
			}

			if (activeInventoryOwner == unsafeWindow.g_ActiveInventory.owner.strSteamId && activeInventoryAppid == unsafeWindow.g_ActiveInventory.appid && activeInventoryContextid == unsafeWindow.g_ActiveInventory.contextid) {
				return;
			}
			activeInventoryAppid = unsafeWindow.g_ActiveInventory.appid;
			activeInventoryContextid = unsafeWindow.g_ActiveInventory.contextid;
			activeInventoryOwner = unsafeWindow.g_ActiveInventory.owner.strSteamId;

			if (activeInventoryAppid == 753 && (activeInventoryContextid == 0 || activeInventoryContextid == 6)) {
				customContainer.style.display = null;

				var selectGame = customContainer.querySelector("#select_game_to_trade");
				var tags = unsafeWindow.g_ActiveInventory.tags.Game.tags;
				var options = `<option value="all">全部</option>`;
				for (var appid in tags) {
					options += `<option value="${appid}">${tags[appid].name}</option>`;
				}
				selectGame.innerHTML = options;

				customContainer.querySelector("#select_item_class_to_trade").innerHTML = `
					<option value="cardborder_0">普通卡牌</option>
					<option value="cardborder_1">闪亮卡牌</option>
					<option value="item_class_3">背景</option>
					<option value="item_class_4">表情</option>
					<option value="item_class_5">补充包</option>
					<option value="all">全部</option>
				`;

				customContainer.querySelector("#select_quantity_unit").innerHTML = `
					<option value="set">组</option>
					<option value="sheet">个</option>
				`;
			} else {
				customContainer.style.display = "none";
			}
		}

		function itemClicked(event) {
			if (unsafeWindow.CTradeOfferStateManager.m_eTradeOfferState == unsafeWindow.CTradeOfferStateManager.TRADE_OFFER_STATE_VIEW) {
				return;
			}

			var elem = event.target;
			if (elem.parentNode.id.match(/^item.+/) && elem.parentNode.classList.contains("item")) {
				elem = elem.parentNode;
			}
			if (elem.id.match(/^item.+/) && elem.classList.contains("item")) {
				elem.firstElementChild.addEventListener("dblclick", e => {e.stopPropagation();});  //消除单击过快触发双击事件
				unsafeWindow.OnDoubleClickItem(event, elem);
			}
		}

		function optButtonClicked(event) {
			if (unsafeWindow.CTradeOfferStateManager.m_eTradeOfferState == unsafeWindow.CTradeOfferStateManager.TRADE_OFFER_STATE_VIEW) {
				return;
			}

			var button = event.target;
			if (button.classList.contains("btn_add_custom")) {
				addCustomItems();
			} else if (button.classList.contains("btn_add_all")) {
				addAllItems();
			} else if (button.classList.contains("btn_add_current")) {
				addCurrentItems();
			}
		}

		function addCustomItems() {
			var g_ActiveInventory = unsafeWindow.g_ActiveInventory;
			if (g_ActiveInventory.appid != 753 || (g_ActiveInventory.contextid != 0 && g_ActiveInventory.contextid != 6)) {
				return;
			}

			if (!g_ActiveInventory.classifiedItems) {
				g_ActiveInventory.classifiedItems = {};
				for (var page of g_ActiveInventory.pageList) {
					for (var itemHolder of page.children) {
						var item = itemHolder?.rgItem;
						if (item && item.tradable && item.tags) {
							var feeAppid = null;
							var itemClass = null; 
							var cardborder = null;
							var hashName = item.market_hash_name;
							for (var tag of item.tags) {
								if (tag.category == "Game") {
									feeAppid = tag.internal_name;
								} else if (tag.category == "item_class") {
									itemClass = tag.internal_name;
								} else if (tag.category == "cardborder") {
									cardborder = tag.internal_name;
								}
							}
							if (feeAppid && itemClass) {
								g_ActiveInventory.classifiedItems[feeAppid] ??= {};
								if (itemClass == "item_class_2") {
									g_ActiveInventory.classifiedItems[feeAppid][cardborder] ??= {};
									g_ActiveInventory.classifiedItems[feeAppid][cardborder][hashName] ??= [];
									g_ActiveInventory.classifiedItems[feeAppid][cardborder][hashName].push(itemHolder);
								} else {
									g_ActiveInventory.classifiedItems[feeAppid][itemClass] ??= {};
									g_ActiveInventory.classifiedItems[feeAppid][itemClass][hashName] ??= [];
									g_ActiveInventory.classifiedItems[feeAppid][itemClass][hashName].push(itemHolder);
								}
							}
						}
					}
				}
			}

			var selectGame = customContainer.querySelector("#select_game_to_trade");
			var selectItemClass = customContainer.querySelector("#select_item_class_to_trade");
			var inputQuantity = customContainer.querySelector("#input_quantity_to_trade");
			var selectUnit = customContainer.querySelector("#select_quantity_unit");

			var gameAppidList = selectGame.value == "all"? Object.keys(unsafeWindow.g_ActiveInventory.tags.Game.tags): [selectGame.value];
			var itemClassList = selectItemClass.value == "all"? ["cardborder_0", "cardborder_1", "item_class_3", "item_class_4", "item_class_5"]: [selectItemClass.value];
			var itemQuantity = inputQuantity.value && parseInt(inputQuantity.value) > 0? parseInt(inputQuantity.value): -1;

			var itemsToTrade = [];
			if (selectUnit.value == "set") {
				for (var appid of gameAppidList) {
					for (var itemCls of itemClassList) {
						for (var itemName in g_ActiveInventory.classifiedItems[appid][itemCls]) {
							var itemList = g_ActiveInventory.classifiedItems[appid][itemCls][itemName];
							var itemNum = itemQuantity > 0? Math.min(itemList.length, itemQuantity): itemList.length;
							var num = 0;
							for (var itemHolder of itemList) {
								if (itemHolder == itemHolder.rgItem.element?.parentNode) {
									itemsToTrade.push([itemHolder.rgItem, itemHolder.rgItem.original_amount]);
									num++;
									if (num >= itemNum) {
										break;
									}
								}
							}
						}
					}
				}
			} else {
				for (var appid of gameAppidList) {
					for (var itemCls of itemClassList) {
						var num = 0;
						for (var itemName in g_ActiveInventory.classifiedItems[appid][itemCls]) {
							for (var itemHolder of g_ActiveInventory.classifiedItems[appid][itemCls][itemName]) {
								if (itemHolder == itemHolder.rgItem.element?.parentNode) {
									itemsToTrade.push([itemHolder.rgItem, itemHolder.rgItem.original_amount]);
									num++;
									if (itemQuantity > 0 && num >= itemQuantity) {
										break;
									}
								}
							}
							if (itemQuantity > 0 && num >= itemQuantity) {
								break;
							}
						}
					}
				}
			}
			moveItemsToTrade(itemsToTrade);
		}

		function addAllCommonCards() {
			var itemsToTrade = [];
			var g_ActiveInventory = unsafeWindow.g_ActiveInventory;
			if (g_ActiveInventory && g_ActiveInventory.appid == 753 && (g_ActiveInventory.contextid == 0 || g_ActiveInventory.contextid == 6) && g_ActiveInventory.pageList) {
				for (var page of g_ActiveInventory.pageList) {
					for (var itemHolder of page.children) {
						if (itemHolder?.rgItem?.tradable && checkCommonCard(itemHolder.rgItem.tags) && itemHolder == itemHolder.rgItem.element?.parentNode) {
							itemsToTrade.push([itemHolder.rgItem, itemHolder.rgItem.original_amount]);
						}
					}
				}
			}
			moveItemsToTrade(itemsToTrade);
		}

		function addAllItems() {
			var includeStackable = tradeButtons.querySelector("#include_stackable_item").checked;
			var itemsToTrade = [];
			var g_ActiveInventory = unsafeWindow.g_ActiveInventory;
			if (g_ActiveInventory && g_ActiveInventory.pageList) {
				for (var page of g_ActiveInventory.pageList) {
					for (var itemHolder of page.children) {
						if (itemHolder?.rgItem?.tradable && itemHolder.style.display != "none" && (includeStackable || !itemHolder.rgItem.is_stackable) && itemHolder == itemHolder.rgItem.element?.parentNode) {
							itemsToTrade.push([itemHolder.rgItem, itemHolder.rgItem.original_amount]);
						}
					}
				}
			}
			moveItemsToTrade(itemsToTrade);
		}

		function addCurrentItems() {
			var includeStackable = tradeButtons.querySelector("#include_stackable_item").checked;
			var itemsToTrade = [];
			var g_ActiveInventory = unsafeWindow.g_ActiveInventory;
			for (var itemHolder of g_ActiveInventory.pageList[g_ActiveInventory.pageCurrent].children) {
				if (itemHolder?.rgItem?.tradable && itemHolder.style.display != "none" && (includeStackable || !itemHolder.rgItem.is_stackable && itemHolder == itemHolder.rgItem.element?.parentNode)) {
					itemsToTrade.push([itemHolder.rgItem, itemHolder.rgItem.original_amount]);
				}
			}
			moveItemsToTrade(itemsToTrade);
		}

		function removeAllItems(event) {
			if (unsafeWindow.CTradeOfferStateManager.m_eTradeOfferState == unsafeWindow.CTradeOfferStateManager.TRADE_OFFER_STATE_VIEW) {
				return;
			}

			if (event.currentTarget.classList.contains("trade_yours_bottons")) {
				var select = "#your_slots div.item";
			} else if (event.currentTarget.classList.contains("trade_theirs_bottons")) {
				var select = "#their_slots div.item";
			} else {
				return;
			}

			var itmesToInventory = [];
			if (event.target.classList.contains("btn_remove_all")) {
				for (var elItem of document.querySelectorAll(select)) {
					itmesToInventory.push(elItem.rgItem);
				}
			}
			moveItemsToInventory(itmesToInventory);
		}

		function checkCommonCard(tags) {
			var flag = 0;
			for (var tag of tags) {
				if ((tag.category == "item_class" && tag.internal_name == "item_class_2") || (tag.category == "cardborder" && tag.internal_name == "cardborder_0")) {
					flag++;
				}
			}
			return flag == 2;
		}

		//unsafeWindow.MoveItemToTrade
		function moveItemsToTrade(items) {
			for (var [item, xferAmount] of items) {
				setAssetOrCurrencyInTrade(item, xferAmount || 1);
			}
			unsafeWindow.CTradeOfferStateManager.UpdateTradeStatus();
		}

		//unsafeWindow.CTradeOfferStateManager.SetAssetOrCurrencyInTrade
		function setAssetOrCurrencyInTrade(item, xferAmount) {
			var is_currency = item.is_currency;
			var userslots = item.is_their_item ? unsafeWindow.g_rgCurrentTradeStatus.them : unsafeWindow.g_rgCurrentTradeStatus.me;
			var slots = is_currency ? userslots.currency : userslots.assets;
	
			// find existing element
			var iExistingElement = -1;
			for (var i = 0; i < slots.length; i++) {
				var rgSlotItem = slots[i];
				if (rgSlotItem.appid == item.appid && rgSlotItem.contextid == item.contextid &&
					((is_currency ? rgSlotItem.currencyid : rgSlotItem.assetid) == item.id)) {

					iExistingElement = i;
					if (xferAmount == 0) {
						slots.splice(i, 1);
					}
					break;
				}
			}
	
			if (xferAmount > 0) {
				if (iExistingElement != -1) {
					if (slots[iExistingElement].amount != xferAmount) {
						slots[iExistingElement].amount = xferAmount;
					}
				} else {
					var oSlot = {
						appid: item.appid,
						contextid: item.contextid,
						amount: xferAmount
					};
					if (is_currency)
						oSlot.currencyid = item.id;
					else
						oSlot.assetid = item.id;
	
					slots.push(oSlot);
				}
			}
		}

		//unsafeWindow.MoveItemToInventory
		function moveItemsToInventory(items) {
			for (var item of items) {
				var elItem = item.element;
				if (unsafeWindow.BIsInTradeSlot(elItem)) {
					unsafeWindow.CleanupSlot(elItem.parentNode.parentNode);
				}

				if (item.is_stackable) {
					setAssetOrCurrencyInTrade(item, 0);
					unsafeWindow.UpdateTradeItemStackDisplay(item.parent_item, item, 0 );
					elItem.remove();
				} else {
					item.homeElement.appendChild(item.element.remove());
					// if the inventory view is filtered, make sure the item applies
					if (unsafeWindow.g_ActiveInventory && unsafeWindow.g_ActiveInventory.appid == item.appid && unsafeWindow.g_ActiveInventory.contextid == item.contextid )
						unsafeWindow.Filter.ApplyFilter(document.querySelector("#filter_control").value, item.element);

					item.homeElement.down(".slot_actionmenu_button").show();
					removeItemFromTrade(item);
				}
			}

			unsafeWindow.CTradeOfferStateManager.UpdateTradeStatus();
		}

		//unsafeWindow.CTradeOfferStateManager.RemoveItemFromTrade
		function removeItemFromTrade(item) {
			var slots = item.is_their_item ? unsafeWindow.g_rgCurrentTradeStatus.them : unsafeWindow.g_rgCurrentTradeStatus.me;

			for (var i = 0; i < slots.assets.length; i++) {
				var rgAsset = slots.assets[i];
				if (rgAsset.appid == item.appid && rgAsset.contextid == item.contextid && rgAsset.assetid == item.id) {
					slots.assets.splice(i, 1);
					break;
				}
			}
		}
	}

	//全部交易报价页面
	function steamTradeOffersPage() {
		if(!location.href.match(/^https?\:\/\/steamcommunity\.com\/(id|profiles)\/[^\/]+\/tradeoffers\b/)) {
			return;
		}
		
		var styleElem = document.createElement("style");
		styleElem.innerHTML = `.tradeoffer_item_list { overflow: auto; max-height: 250px; z-index: 2; position: relative; }`;
		document.body.appendChild(styleElem);

		for (var actions of document.querySelectorAll(".tradeoffer_footer_actions")) {
			if (actions.firstElementChild.href.match(/\bShowTradeOffer\b/)) {
				var tradeOfferID = actions.firstElementChild.href.match(/\b(\d+)\b/)[1];
				var elem = document.createElement("a");
				elem.className = "whiteLink";
				elem.textContent = "接受交易";
				elem.setAttribute("data-tradeOfferID", tradeOfferID);
				elem.onclick = acceptTradeOffer;

				var textNode = document.createTextNode(" | ");
				actions.insertBefore(textNode, actions.firstChild);
				actions.insertBefore(elem, actions.firstChild);
			}
		}

		function acceptTradeOffer(event) {
			var tradeOfferID = event.target.getAttribute("data-tradeOfferID");
			unsafeWindow.ShowConfirmDialog("接受交易", "您确定要接受此报价吗？", "接受交易", null, "进行还价").done(function(button) {
				if (button == "OK") {
					sendAcceptTradeOffer(tradeOfferID);
				} else {
					unsafeWindow.ShowTradeOffer(tradeOfferID, {counteroffer: 1});
				}
			});
		}

		async function sendAcceptTradeOffer(tradeOfferID) {
			var tradeOfferPage = await getHtmlDocument("https://steamcommunity.com/tradeoffer/" + tradeOfferID);
			var tradePartnerSteamID = tradeOfferPage?.body.innerHTML.match(/\bg_ulTradePartnerSteamID\s*=\s*\'(\d+)\'/)[1];

			var xhr = new XMLHttpRequest();
			xhr.open("POST", `https://steamcommunity.com/tradeoffer/${tradeOfferID}/accept`, true);
			xhr.setRequestHeader("content-type", "application/x-www-form-urlencoded; charset=UTF-8");
			xhr.withCredentials = true;
			xhr.onload = function(e) {
				var data = JSON.parse(e.target.response);
				var bNeedsEmailConfirmation = data && data.needs_email_confirmation;
				var bNeedsMobileConfirmation = data && data.needs_mobile_confirmation;
				var Modal;

				if (e.target.status == 200) {
					if (bNeedsMobileConfirmation) {
						Modal = unsafeWindow.ShowAlertDialog("需要额外确认", "若要完成此交易，您必须在 Steam 手机应用中进行验证。您可以通过启动应用并从菜单导航至确认页面来验证。");
						//MessageWindowOpener( { type: 'await_confirm', tradeofferid: nTradeOfferID } );
					} else if (bNeedsEmailConfirmation) {
						Modal = unsafeWindow.ShowAlertDialog("需要额外确认", `若要发送此交易报价，您必须完成一个额外的验证步骤。对于该验证的说明已发送到您（结尾是“${data.email_domain}”）的电子邮件地址。`);
						//MessageWindowOpener( { type: 'await_confirm', tradeofferid: nTradeOfferID } );
					} else {
						//MessageWindowOpener( { type: 'accepted', tradeofferid: nTradeOfferID } );
					}

				} else {
					unsafeWindow.ShowAlertDialog("接受交易", data && data.strError ? data.strError : "发送交易报价时发生了一个错误。请稍后再试。");
				}
			};
			xhr.onerror = function(data) {
				console.log(data);
				unsafeWindow.ShowAlertDialog("接受交易", data && data.strError ? data.strError : "发送交易报价时发生了一个错误。请稍后再试。");
			};
			xhr.ontimeout = function(data) {
				console.log(data);
				unsafeWindow.ShowAlertDialog("接受交易", data && data.strError ? data.strError : "发送交易报价时发生了一个错误。请稍后再试。");
			};
			xhr.send(`sessionid=${unsafeWindow.g_sessionID}&serverid=1&tradeofferid=${tradeOfferID}&partner=${tradePartnerSteamID}&captcha=`);
		}

	}

	//库存界面
	function steamInventoryPage(){  
		if(!location.href.match(/^https?\:\/\/steamcommunity\.com\/(id|profiles)\/[^\/]+\/inventory\b/)) {
			return;
		}

		addSteamCommunitySetting();

		if (document.querySelector("#no_inventories")) {
			return;
		}

		allMyBuyOrders.load();

		var currencyInfo = getCurrencyInfo();
		var sellTotalPriceReceive = 0;
		var sellTotalPriceBuyerPay = 0;
		var sellCount = 0;
		var autoSellTimer = 0;

		var priceGramLoaded = false;
		var inventoryAppidForSell = 0;
		var inventoryAppidForLink = 0;
		var inventoryAppidForFilter = 0;
		var sellNumber = globalSettings.inventory_sell_number;

		appendAutoSellCheckbox();
		if (getStorageValue("SFU_AUTO_SELL")) {
			checkAutoSellItem();
		}

		//修改页面布局
		if (globalSettings.inventory_set_style) {
			changeInventoryPage();
			appendPageControl();
		}

		//只显示普通卡牌
		if (globalSettings.inventory_set_filter) {
			document.querySelector("#games_list_public .games_list_tabs").addEventListener("click", function(event) {
				if (inventoryAppidForFilter != unsafeWindow.g_ActiveInventory.appid) {
					inventoryAppidForFilter = unsafeWindow.g_ActiveInventory.appid;
					waitLoadInventory();
				}
			});
			waitLoadInventory();
		}

		if (globalSettings.inventory_append_linkbtn) {
			appendInventoryPageLinkBtn();
		}

		if (globalSettings.inventory_sell_btn || globalSettings.inventory_market_info) {
			appendPriceGramAndSellBtn();
		}

		//修改页面布局
		function changeInventoryPage() {  
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `div#inventory_logos, div#tabcontent_inventory .filter_label {display: none;} 
									div#tabcontent_inventory {padding-top: 12px;}
									.profile_small_header_texture .inventory_links {position: absolute; right: 20px; bottom: 0px;}
									div.inventory_rightnav {margin: 0px 12px 12px auto; display: flex;}
									div.inventory_rightnav>a, div.inventory_rightnav>div {flex: 0 0 auto; overflow: hidden; margin-bottom: auto;}
									.tabitems_ctn>.games_list_separator.responsive_hidden {display: none;}
									.btn_small>span {user-select: none;}`;
			document.body.appendChild(styleElem);
		
			var header = document.querySelector("div.profile_small_header_texture");
			var inventory_links = document.querySelector("div.inventory_links");
			if (header && inventory_links) {
				//调整交易报价按键的位置
				header.appendChild(inventory_links);
			}
		}
		
		//等待物品加载完设置过滤
		function waitLoadInventory(load=true) {  
			var selectElem = document.querySelector("select#market_item_filter");

			var isLoaded = true;
			if (typeof unsafeWindow.g_ActiveInventory === "undefined" || unsafeWindow.g_ActiveInventory == null || !unsafeWindow.g_ActiveInventory.appid) {
				isLoaded = false;
			}
			if (isLoaded && unsafeWindow.g_ActiveInventory.appid != 753) {
				if (selectElem) {
					selectElem.style.display = "none";
				}
				return;
			}
			if (isLoaded && !unsafeWindow.g_ActiveInventory.BIsFullyLoaded()) {
				isLoaded = false;
				if (load) {
					load = false;
					unsafeWindow.g_ActiveInventory.ShowTags();
				}
			}
			if (!isLoaded) {
				setTimeout(function() {
					waitLoadInventory(load);
				}, 100);
				return;
			}

			if (!selectElem) {
				selectElem = document.createElement("select");
				selectElem.id = "market_item_filter";
				selectElem.style = "background: #000; color: #ebebeb; cursor: pointer; padding: 3px; font-size: 12px;";
				selectElem.onchange = showRestrictedItems;

				var container = document.createElement("div");
				container.style = "float: right; margin-left: 12px;"

				container.appendChild(selectElem);
				document.querySelector(".inventory_filters .filter_tag_button_ctn").appendChild(container);
				document.querySelector("#filter_tag_hide").addEventListener("click", function() { selectElem.value = "0";});
			
				var hasMarketableCards = false;
				var restriction = {};
				var inventory = unsafeWindow.g_ActiveInventory.m_rgChildInventories?.[6] || unsafeWindow.g_ActiveInventory;
				var descriptions = inventory.m_rgDescriptions;

				for (var key in descriptions) {  //按照可出售时间分类
					var desc = descriptions[key];
					if (!desc.marketable) {		
						var restrictedTime = desc.owner_descriptions?.[0]?.value?.match(/\[date\](\d+)\[\/date\]/)?.[1];
						if (restrictedTime) {
							desc.tags ??= [];
							desc.tags.push({category: "restrictedTime", internal_name: restrictedTime});
							restriction[restrictedTime] = (restriction[restrictedTime] ?? 0) + desc.use_count;
						}
					}

					if (!hasMarketableCards && desc.marketable && getCardBorder(desc) == "cardborder_0") {  //判断是否有可交易的普通卡牌
						hasMarketableCards = true;
					}
				}

				//可选择只显示指定可交易时间的物品
				var restrictionList = Object.keys(restriction);
				restrictionList.sort();
				var html = `<option value="0">全部物品</option><option value="1">现在可出售的普通卡牌</option><option value="2">现在可出售的全部物品</option>`;
				for (var time of restrictionList) {
					var localTime = new Date(time * 1000).toLocaleString();
					html += `<option value="${time}">${localTime} 后可出售 (${restriction[time]})</option>`;
				}

				selectElem.innerHTML = html;
				
				if (hasMarketableCards) {
					selectElem.setAttribute("has-marketable-cards", "true");
				}
			}

			selectElem.style.display = null;
			selectElem.value = "0";

			if (selectElem.getAttribute("has-marketable-cards") == "true") {
				selectElem.value = "1";
				selectElem.dispatchEvent(new Event("change"));
			}
		}

		function showRestrictedItems(event) {
			var select = event.target;
			unsafeWindow.g_ActiveInventory.SetActivePage(0);
			if (select.value <= 0) {
				Filter.UpdateTagFiltering({});
			} else if (select.value == 1) {
				Filter.UpdateTagFiltering({"cardborder": ["cardborder_0"], "misc": ["marketable"]});
			} else if (select.value == 2) {
				Filter.UpdateTagFiltering({"misc": ["marketable"]});
			} else {
				Filter.UpdateTagFiltering({"restrictedTime": [select.value]});
			}

			//物品太多时部分图片无法加载
			if (select.value > 0) {
				select.imageReloaded = select.imageReloaded ?? {};
				if (!select.imageReloaded[select.value]) {
					for (var itemHolder of document.querySelectorAll('#inventories .itemHolder:not([style="display: none;"])')) {
						var imgElem = itemHolder.querySelector("img");
						if (imgElem && (!imgElem.src || imgElem.src.includes("trans.gif"))) {
							imgElem.src = unsafeWindow.ImageURL(itemHolder.rgItem.description.icon_url, "96f", "96f", true);
						}
					}
					select.imageReloaded[select.value] = true;
				}
			}
		}

		//在右侧大图片上方添加市场价格信息和出售按键
		function appendPriceGramAndSellBtn() {
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `.price_gram_table {min-height: 172px; display: flex; margin: 5px 10px; cursor: pointer; text-align: center;} .price_gram_table>div:first-child {margin-right: 5px;} .price_gram_table>div {flex: auto; border: 1px solid #000000;} 
									.price_gram_table .table_title {text-align: center; font-size: 12px;} .price_gram_table th, .price_gram_table td {width: 75px; text-align: center; font-size: 12px; line-height: 18px;} 
									.price_gram_table tr:nth-child(odd) {background: #00000066;} .price_gram_table tr:nth-child(even) {background: #00000033;} .price_overview {margin-left: 10px; white-space: nowrap;} 
									.price_overview>div {display: inline-block;} .price_overview span {margin-right: 20px; font-size: 12px;} 
									.sell_price_input {text-align: center; margin-right: 2px; width: 90px;} .sell_btn_container {margin: 5px 10px;} 
									.quick_sell_btn {margin: 5px 5px 0px 0px;} .quick_sell_btn>span {padding: 0px 5px; pointer-events: none;} .price_receive, .price_receive_2 {margin: 0 20px 0 0; font-size: 12px; white-space: nowrap;}
									.show_market_info {border-radius: 2px; background: #000000; color: #FFFFFF; margin: 10px 0px 0px 10px; cursor: pointer; padding: 2px 15px; display: inline-block;} 
									.show_market_info:hover {background: rgba(102, 192, 244, 0.4)} .price_gram, .price_gram div{font-size: 12px; font-weight: normal;}`;
			document.body.appendChild(styleElem);

			var html = `<div><a class="show_market_info">显示市场价格信息</a></div><div class="market_info">
						<div class="price_gram"><div class="price_gram_table"><div><div class="table_title">出售</div><br>Loading...</div><div><div class="table_title">购买</div><br>Loading...</div></div></div>
						<div class="price_overview"><div><span>Loading...</span></div><div></div></div></div>
						<div class="sell_btn_container">
						<div><input class="sell_price_input" type="number" step="0.01" min="0.03" style="color: #FFFFFF; background: #000000; border: 1px solid #666666;" title="出售价格(买家支付)">
						<a class="btn_small btn_green_white_innerfade sell_comfirm quick_sell_btn"><span>确认出售</span></a>
						<a class="btn_small btn_green_white_innerfade sell_all_same quick_sell_btn" title="批量出售相同的物品"><span>批量出售</span></a>
						<input class="sell_number_input" type="number" min="1" step="1"  style="color: #FFFFFF; background: #000000; border: 1px solid #666666; width: 60px; text-align: center;" placeholder="全部" title="一次批量出售的数量"></div>
						<div><label class="price_receive" title="买家支付的金额(您收到的金额)"></label><label class="price_receive_2"></label></div><div class="sell_btns" style="float: left;"></div>
						<div style="float: left;"><a class="btn_small btn_green_white_innerfade quick_sell_btn auto_sell_btn"><span>自动出售</span></a></div><div style="clear: both;"></div></div>`;
			var container0 = document.createElement("div");
			container0.id = "price_gram_container0";
			var container1 = document.createElement("div");
			container1.id = "price_gram_container1";
			var targetElem = document.querySelector("#iteminfo0");
			targetElem.insertBefore(container0, targetElem.firstElementChild);
			var targetElem = document.querySelector("#iteminfo1");
			targetElem.insertBefore(container1, targetElem.firstElementChild);

			document.querySelector("#inventories").addEventListener("click", function(event) {
				if (!event.target.classList.contains("inventory_item_link")) {
					return;
				}
				container0.innerHTML = "";
				container1.innerHTML = "";
				let selectedItem = unsafeWindow.g_ActiveInventory.selectedItem;
				if (selectedItem && selectedItemMarketable(selectedItem)) {
					priceGramLoaded = false;
					container0.innerHTML = html;
					container1.innerHTML = html;

					container0.querySelector(".price_gram_table").onclick = event => showMarketInfoDialog(selectedItem);
					container1.querySelector(".price_gram_table").onclick = event => showMarketInfoDialog(selectedItem);

					if (globalSettings.inventory_sell_btn && selectedItem.description.marketable) {
						document.querySelector("#price_gram_container0 .sell_price_input").oninput = event => showPriceReceive(event, selectedItem);
						document.querySelector("#price_gram_container1 .sell_price_input").oninput = event => showPriceReceive(event, selectedItem);
						document.querySelector("#price_gram_container0 .sell_price_input").onmousewheel = event => event.preventDefault();
						document.querySelector("#price_gram_container1 .sell_price_input").onmousewheel = event => event.preventDefault();
						document.querySelector("#price_gram_container0 .sell_comfirm").onclick = event => sellItemCustom(event, selectedItem);
						document.querySelector("#price_gram_container1 .sell_comfirm").onclick = event => sellItemCustom(event, selectedItem);
						document.querySelector("#price_gram_container0 .sell_all_same").onclick = event => sellAllSameItem(event, selectedItem);
						document.querySelector("#price_gram_container1 .sell_all_same").onclick = event => sellAllSameItem(event, selectedItem);
						document.querySelector("#price_gram_container0 .auto_sell_btn").onclick = event => addToAutoSell(event, selectedItem);
						document.querySelector("#price_gram_container1 .auto_sell_btn").onclick = event => addToAutoSell(event, selectedItem);
						document.querySelector("#price_gram_container0 .sell_number_input").oninput = event => sellNumber = event.target.value;
						document.querySelector("#price_gram_container1 .sell_number_input").oninput = event => sellNumber = event.target.value;
						document.querySelector("#price_gram_container0 .sell_number_input").value = sellNumber > 0? sellNumber: '';
						document.querySelector("#price_gram_container1 .sell_number_input").value = sellNumber > 0? sellNumber: '';
					} else {
						document.querySelector("#price_gram_container0 .sell_btn_container").style.display = "none";
						document.querySelector("#price_gram_container1 .sell_btn_container").style.display = "none";
					}

					if (globalSettings.inventory_market_info) {
						showMarketInfo();
					} else {
						document.querySelector("#price_gram_container0 .show_market_info").onclick = showMarketInfo;
						document.querySelector("#price_gram_container1 .show_market_info").onclick = showMarketInfo;
					}
				}
			});

			document.querySelector("#games_list_public .games_list_tabs").addEventListener("click", function(event) {
				if (inventoryAppidForSell != unsafeWindow.g_ActiveInventory.appid) {
					inventoryAppidForSell = unsafeWindow.g_ActiveInventory.appid;
					container0.innerHTML = "";
					container1.innerHTML = "";
				}
			});

			//添加上架日志显示区
			var logHtml = `<style>#sell_log_container {width: 100%; overflow: hidden;}  
						   #sell_log_text {font-size: 12px; max-height: 300px; overflow-y: auto; margin-top: 10px;} 
						   #sell_log_total {font-weight: bold; margin-top: 5px}</style>
						   <div id="sell_log_text"></div><div id="sell_log_total"></div>
						   <div id="sell_log_actions" style="display: none; margin-top: 10px;">
						   <a id="clear_sell_log" class="pagecontrol_element pagebtn" style="margin-right: 2px;">清空</a>
						   <a id="scroll_bottom_sell_log" class="pagecontrol_element pagebtn">滚动到底</a>
						   </div>`;
			var logContainer = document.createElement("div");
			logContainer.id = "sell_log_container";
			logContainer.innerHTML = logHtml;

			document.querySelector("div#active_inventory_page>div.inventory_page_left")?.insertBefore(logContainer, document.querySelector("div#inventory_pagecontrols").nextElementSibling);
			document.querySelector("#clear_sell_log").onclick = function() {
				sellTotalPriceReceive = 0;
				sellTotalPriceBuyerPay = 0;
				sellCount = 0;
				document.querySelector("#sell_log_text").innerHTML = "";
				document.querySelector("#sell_log_total").innerHTML = "";
				document.querySelector("#sell_log_actions").style.display = "none";
			};

			document.querySelector("#scroll_bottom_sell_log").onclick = function() {
				document.querySelector("#sell_log_text").scroll(0, document.querySelector("#sell_log_text").scrollHeight);
			}
		}

		function showMarketInfoDialog(item) {
			var appid = item.appid;
			var hashName = getMarketHashName(item.description);
			dialogPriceInfo.show(appid, hashName, currencyInfo, null, function(data2, currency) { 
				updatePriceGram(item, data2, currency); 
			}, function(data3, currency) { 
				updatePriceOverview(item, data3, currency); 
			});
		}

		function showMarketInfo() {
			document.querySelector("#price_gram_container0 .show_market_info").style.display = "none";
			document.querySelector("#price_gram_container1 .show_market_info").style.display = "none";
			let selectedItem = unsafeWindow.g_ActiveInventory.selectedItem;
			if (selectedItem && selectedItemMarketable(selectedItem)) {
				let appid = selectedItem.appid;
				let hashName = getMarketHashName(selectedItem.description);
				showPriceGram(appid, hashName, selectedItem);
				showPriceOverview(appid, hashName, selectedItem);
				showMyBuyOrder(appid, hashName);
			}
		}

		async function showPriceGram(appid, hashName, item) {
			var data = await getCurrentItemOrdersHistogram(currencyInfo.country, currencyInfo.eCurrencyCode, appid, hashName, true);
			updatePriceGram(item, data, currencyInfo);
		}

		function updatePriceGram(item, data, currencyInf) {
			if (data && item.assetid == unsafeWindow.g_ActiveInventory.selectedItem.assetid && currencyInf.strCode == currencyInfo.strCode) {
				var container0 = document.querySelector("#price_gram_container0");
				var container1 = document.querySelector("#price_gram_container1");
				if (data.success) {
					priceGramLoaded = true;
					var html = `<div><div class="table_title">出售</div>${data.sell_order_table || data.sell_order_summary}</div><div><div class="table_title">购买</div>${data.buy_order_table || data.buy_order_summary}</div>`;

					//添加快速出售按键
					if (globalSettings.inventory_sell_btn && item.description.marketable) {
						var btnHtml = "";
						if (data.lowest_sell_order) {
							container0.querySelector(".sell_price_input").value = (data.lowest_sell_order / 100.0).toFixed(2);
							container1.querySelector(".sell_price_input").value = (data.lowest_sell_order / 100.0).toFixed(2);

							var priceStr0 = getSymbolStrFromPrice(parseInt(data.lowest_sell_order), currencyInfo);
							var priceStr1 = getSymbolStrFromPrice(parseInt(data.lowest_sell_order - 1), currencyInfo);
							btnHtml += `<a class="btn_small btn_green_white_innerfade quick_sell_btn" data-price="${data.lowest_sell_order}"><span>${priceStr0}</span></a>`;
							btnHtml += `<a class="btn_small btn_green_white_innerfade quick_sell_btn" data-price="${data.lowest_sell_order - 1}"><span>${priceStr1}</span></a>`;
						}
						if (data.highest_buy_order) {
							var priceStr2 = getSymbolStrFromPrice(parseInt(data.highest_buy_order), currencyInfo);
							btnHtml += `<a class="btn_small btn_green_white_innerfade quick_sell_btn" data-price="${data.highest_buy_order}"><span>${priceStr2}</span></a>`;
						}
		
						container0.querySelector(".sell_btns").innerHTML = btnHtml;
						container1.querySelector(".sell_btns").innerHTML = btnHtml;
						container0.querySelector(".sell_btns").onclick = event => quickSellItem(event, item);
						container1.querySelector(".sell_btns").onclick = event => quickSellItem(event, item);
						container0.querySelector(".sell_price_input").dispatchEvent(new Event("input"));
						container1.querySelector(".sell_price_input").dispatchEvent(new Event("input"));
					}
				} else {
					var html = `<div><div class="table_title">出售</div><div>${errorTranslator(data)}</div></div><div><div class="table_title">购买</div><div>${errorTranslator(data)}</div></div>`;
				}
				container0.querySelector(".price_gram .price_gram_table").innerHTML = html;
				container1.querySelector(".price_gram .price_gram_table").innerHTML = html;
			}
		}

		async function showPriceOverview(appid, marketHashName, item) {
			var data = await getCurrentPriceOverview(currencyInfo.country, currencyInfo.eCurrencyCode, appid, marketHashName, true);
			updatePriceOverview(item, data, currencyInfo);
		}

		function updatePriceOverview(item, data, currencyInf) {
			if (data && item.assetid == unsafeWindow.g_ActiveInventory.selectedItem.assetid && currencyInf.strCode == currencyInfo.strCode) {
				var container0 = document.querySelector("#price_gram_container0");
				var container1 = document.querySelector("#price_gram_container1");
				if (data.success) {
					var html = "";
					html += data.lowest_price ? `<span title="最低售价">${data.lowest_price}</span>` : "";
					html += data.volume ? `<span title="24小时内销量">${data.volume} 个</span>` : "";
					html += data.median_price ? `<span title="上一小时售价中位数">${data.median_price}</span>` : "";

					if (globalSettings.inventory_sell_btn && !priceGramLoaded && data.lowest_price && item.description.marketable) {
						container0.querySelector(".sell_price_input").value = (getPriceFromSymbolStr(data.lowest_price) / 100.0).toFixed(2);
						container1.querySelector(".sell_price_input").value = (getPriceFromSymbolStr(data.lowest_price) / 100.0).toFixed(2);
						container0.querySelector(".sell_price_input").dispatchEvent(new Event("input"));
						container1.querySelector(".sell_price_input").dispatchEvent(new Event("input"));
					}
				} else {
					var html = `<span>${errorTranslator(data)}</span>`;
				}
				container0.querySelector(".price_overview").firstElementChild.innerHTML = html;
				container1.querySelector(".price_overview").firstElementChild.innerHTML = html;
			}
		}

		function showMyBuyOrder(appid, marketHashName) {
			var buyOrder = allMyBuyOrders.get(appid, marketHashName);
			var container0 = document.querySelector("#price_gram_container0");
			var container1 = document.querySelector("#price_gram_container1");
			if (buyOrder) {
				var html = `<span>求购：${buyOrder.quantity} 个 -- ${buyOrder.price}</span>`;
				container0.querySelector(".price_overview").lastElementChild.innerHTML = html;
				container1.querySelector(".price_overview").lastElementChild.innerHTML = html;
			}
		}

		function showPriceReceive(event, item) {
			var elem = event.target;
			var label = elem.parentNode.parentNode.querySelector(".price_receive");
			var label2 = elem.parentNode.parentNode.querySelector(".price_receive_2");
			var amount = isNaN(Number(elem.value)) ? 0 : Math.round(Number(elem.value) * 100);
			var price = calculatePriceYouReceive(amount, item);
			var pay = calculatePriceBuyerPay(price, item);
			label.innerHTML = `${getSymbolStrFromPrice(pay, currencyInfo)} (${getSymbolStrFromPrice(price, currencyInfo)})`;

			if (checkCurrencyRateUpdated(currencyInfo.strCode)) {
				var [pay2, price2] = calculateSecondSellPrice(price, item);
				var currencyInfo2 = getCurrencyInfo(globalCurrencyRate.second_code);
				label2.innerHTML = `${getSymbolStrFromPrice(pay2, currencyInfo2)} (${getSymbolStrFromPrice(price2, currencyInfo2)})`;
			} else {
				label2.innerHTML = "";
			}
		}

		function quickSellItem(event, item) {
			var elem = event.target;
			var amount = elem.getAttribute("data-price");
			if (amount) {
				sellSelectedItem(amount, item);
			}
		}

		function sellItemCustom(event, item) {
			var input = event.currentTarget.parentNode.querySelector("input");
			var amount = isNaN(Number(input.value)) ? 0 : Math.round(Number(input.value) * 100);
			sellSelectedItem(amount, item);
		}

		//批量上架出售相同的物品
		async function sellAllSameItem(event, item) {
			var sellLog = document.querySelector("#sell_log_text");
			var hashName = item.description.market_hash_name;
			var m_rgAssets = unsafeWindow.g_rgAppContextData[item.appid].rgContexts[parseInt(item.contextid)].inventory.m_rgAssets;
			var input = event.currentTarget.parentNode.querySelector("input");
			var amount = isNaN(Number(input.value)) ? 0 : Math.round(Number(input.value) * 100);
			var price = calculatePriceYouReceive(amount, item);
			var buyerPay = calculatePriceBuyerPay(price, item);

			if (hashName && m_rgAssets && price > 0) {
				let maxNumber = sellNumber;
				let cnumber = 0;

				for (let assetid in m_rgAssets) {
					let it = m_rgAssets[assetid];

					if (it?.description?.marketable && it.description.market_hash_name == hashName && !it.element.getAttribute("data-sold")) {
						if (maxNumber > 0 && cnumber >= maxNumber) {
							break;
						}

						let quantity = parseInt(it.amount);
						if (maxNumber > 0) {
							quantity = Math.min(quantity, maxNumber - cnumber);
						}
						
						let result = await sellSelectedItem(0, it, price, buyerPay, quantity);

						if (result && result.success) {
							cnumber += quantity;

							if (globalSettings.inventory_stop_sell && result.requires_confirmation) {
								sellLog.innerHTML += `已停止批量出售<br>`;
								sellLog.scroll(0, sellLog.scrollHeight);
								break;
							}
						} else {
							sellLog.innerHTML += `已停止批量出售<br>`;
							sellLog.scroll(0, sellLog.scrollHeight);
							break;
						}
					}
				}
			}
		}

		async function sellSelectedItem(amount, item, priceReceive=0, pricePay=0, quantity=1) {
			var price = priceReceive || calculatePriceYouReceive(amount, item);
			if (price > 0) {
				var sellLogText = document.querySelector("#sell_log_text");
				var sellLogTotal = document.querySelector("#sell_log_total");

				var data = await sellItem(unsafeWindow.g_sessionID, item.appid, item.contextid, item.assetid, quantity, price);

				var strQuantity = "";
				var strEach = "";
				if (quantity > 1) {
					strQuantity = `${quantity}件 `;
					strEach = "每件";
				}

				var needScrollToBottom = Math.ceil(sellLogText.scrollTop) >= (sellLogText.scrollHeight - sellLogText.clientHeight - 2);
				if (data.success) {
					if (quantity >= item.amount) {
						item.element.style.background = "green";
						item.element.setAttribute("data-sold", "1");
					}

					var buyerPay = pricePay || calculatePriceBuyerPay(price, item);
					sellTotalPriceBuyerPay += buyerPay * quantity;
					sellTotalPriceReceive += price * quantity;
					sellCount ++;

					var strPrice = getSymbolStrFromPrice(price, currencyInfo);
					var strBuyerPay = getSymbolStrFromPrice(buyerPay, currencyInfo);
					var strTotalReceive = getSymbolStrFromPrice(sellTotalPriceReceive, currencyInfo);
					var strTotalBuyerPay = getSymbolStrFromPrice(sellTotalPriceBuyerPay, currencyInfo);

					var logText = `<${sellCount}> ${strQuantity}${item.description.name} 已在市场上架，${strEach}售价为 ${strBuyerPay}，${strEach}将收到 ${strPrice}` + (data.requires_confirmation ? " (需要确认)" : "") + "<br>";
					var logTotal = `累计上架物品的总价为 ${strTotalBuyerPay}，将收到 ${strTotalReceive}`;
					sellLogText.innerHTML += logText;
					sellLogTotal.innerHTML = logTotal;
				} else {
					var logText = `<Failed> ${strQuantity}${item.description.name} 上架市场失败，原因：${data.message || errorTranslator(data)}` + "<br>";
					sellLogText.innerHTML += logText;

					if (data.message && data.message.match(/物品不再存在|no longer in your inventory/)) {
						item.element.style.background = "green";
						item.element.setAttribute("data-sold", "1");
					}
				}

				if (needScrollToBottom) {
					sellLogText.scroll(0, sellLogText.scrollHeight);
				}
				
				document.querySelector("#sell_log_actions").style.display = "inline-block";
				return data;
			}
			return null;
		}

		//在右侧大图片的右边添加链接按键
		function appendInventoryPageLinkBtn() {  
			var btns0 = document.createElement("div");
			btns0.id = "inventory_link_btn0";
			btns0.className = "item_owner_actions";
			btns0.style.padding = "10px 0px 0px 10px";
			btns0.style.display = "none";
			var iconElem0 = document.querySelector("#iteminfo0_content>div.item_desc_icon");
			iconElem0.appendChild(btns0);
			var btns1 = document.createElement("div");
			btns1.id = "inventory_link_btn1";
			btns1.className = "item_owner_actions";
			btns1.style.padding = "10px 0px 0px 10px";
			btns1.style.display = "none";
			var iconElem1 = document.querySelector("#iteminfo1_content>div.item_desc_icon");
			iconElem1.appendChild(btns1);

			document.querySelector("#inventories").addEventListener("click", function(event) {
				if (!event.target.classList.contains("inventory_item_link")) {
					return;
				}
				var selectedItem = unsafeWindow.g_ActiveInventory.selectedItem;
				if (selectedItem && selectedItemMarketable(selectedItem)) {
					var appid = selectedItem.appid;
					var feeApp = selectedItem.description.market_fee_app;
					var hashName = getMarketHashName(selectedItem.description);
					var html = `<a class="btn_small btn_grey_white_innerfade" href="https://steamcommunity.com/market/listings/${appid}/${hashName}" target="_blank"><span>打开市场页面</span></a>`;
					var cardBorder = getCardBorder(selectedItem.description);
					
					if (cardBorder) {
						var link = "https://steamcommunity.com/my/gamecards/" + feeApp + (cardBorder == "cardborder_1" ? "/?border=1": "");
						html += `<a class="btn_small btn_grey_white_innerfade" href="${link}" target="_blank"><span>打开徽章页面</span></a>
								<a class="btn_small btn_grey_white_innerfade" href="https://store.steampowered.com/app/${feeApp}" target="_blank"><span>打开商店页面</span></a>
								<a class="btn_small btn_grey_white_innerfade" href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${feeApp}" target="_blank"><span>Exchange页面</span></a>
								<a class="btn_small btn_grey_white_innerfade" href="https://steamcommunity.com/market/search?appid=753&category_753_Game[]=tag_app_${feeApp}" target="_blank"><span>搜索该游戏物品</span></a>`;
						iconElem0.style.display = "flex";
						iconElem1.style.display = "flex";
					} else {
						html += `<a class="btn_small btn_grey_white_innerfade" href="https://steamcommunity.com/market/search?appid=${appid}${appid==753? '&category_753_Game[]=tag_app_' + feeApp: ''}" target="_blank"><span>搜索该游戏物品</span></a>`;
						iconElem0.style.display = null;
						iconElem1.style.display = null;
					}

					document.querySelector("#inventory_link_btn0").innerHTML = html;
					document.querySelector("#inventory_link_btn1").innerHTML = html;
					document.querySelector("#inventory_link_btn0").style.display = "block";
					document.querySelector("#inventory_link_btn1").style.display = "block";
				} else {
					document.querySelector("#inventory_link_btn0").style.display = "none";
					document.querySelector("#inventory_link_btn1").style.display = "none";
				}
			});

			document.querySelector("#games_list_public .games_list_tabs").addEventListener("click", function(event) {
				if (inventoryAppidForLink != unsafeWindow.g_ActiveInventory.appid) {
					inventoryAppidForLink = unsafeWindow.g_ActiveInventory.appid;
					document.querySelector("#inventory_link_btn0").style.display = "none";
					document.querySelector("#inventory_link_btn1").style.display = "none";
				}
			});
		}

		function selectedItemMarketable(selectedItem) {
			if (selectedItem.description.marketable) {
				return true;
			} else if (selectedItem.description.owner_descriptions) {
				for (var des of selectedItem.description.owner_descriptions) {
					if (des.value.search(/\[date\]\d{10}\[\/date\]/) >= 0 || (selectedItem.description.appid == 322330 && des.value.includes("marketable"))) {
						return true;
					}
				}
			}
			return false;
		}

		function appendAutoSellCheckbox() {
			var setting = getStorageValue("SFU_AUTO_SELL") ?? false;
			var container = document.querySelector("#tabcontent_inventory > .filter_ctn.inventory_filters");
			var elem = document.createElement("div");
			elem.style = "float: left; margin: 6px 0 0 12px;";
			elem.innerHTML = `<input type="checkbox" style="vertical-align: middle; cursor: pointer;" ${setting? "checked=true": ""}><a style="font-size: 13px;">自动出售</a>`;
			container.insertBefore(elem, container.lastElementChild);

			elem.querySelector("input").onchange = function(event) {
				setStorageValue("SFU_AUTO_SELL", event.target.checked);
				if (event.target.checked) {
					checkAutoSellItem();
				} else {
					clearTimeout(autoSellTimer);
				}
			}

			elem.querySelector("a").onclick = function() {
				autoSellSettingsDialog();
			}
		}

		var autoSellNum = 0;
		var autoSellNextTime = {};

		function autoSellSettingsDialog(addItemSetting) {
			autoSellNum = 0;
			var settings = getStorageValue("SFU_AUTO_SELL_SETTINGS") ?? [];
			var html = "";
			var existed = -1;
			for (var item of settings) {
				var row = createRow(item);
				html += row;
			}
			if (addItemSetting) {
				for (var index = 0; index < settings.length; index++) {
					if (settings[index].hashName == addItemSetting.hashName) {
						existed = index;
						break;
					}
				}
				if (existed < 0) {
					var row = createRow(addItemSetting);
					html += row;
				}
			}
			html = `<table id="sfu_auto_sell_settings"><thead><tr><th>no.</th><th>appid</th><th>contextid</th><th>hashName</th>
			        <th title="同一价格的在售数量">samePriceNum</th><th title="允许他人的较低价格在售数量">threshold</th><th colspan=2 title="最低出售价格">lowestPrice</th>
					<th title="检测周期（分钟）">interval</th><th class="auto_sell_settings_add" title="添加">+</th></tr></thead><tbody>${html}</tbody></table>`;
			var container = document.createElement("div");
			container.innerHTML = `<style>#sfu_auto_sell_settings {border-spacing: inherit;} #sfu_auto_sell_settings .auto_sell_settings_input {min-width: 40px;}
								   #sfu_auto_sell_settings th, #sfu_auto_sell_settings td {font-size: 14px; font-weight: normal; text-align: center; padding: 3px 5px; border: 1px solid #FFFFFF22;}
							   	   #sfu_auto_sell_settings thead tr, #sfu_auto_sell_settings tbody tr:nth-child(even) {background: #00000066;} 
				                   #sfu_auto_sell_settings tbody tr:nth-child(odd) {background: #00000033;} #sfu_auto_sell_settings .auto_sell_settings_info {cursor: pointer; width: 20px;}
								   #sfu_auto_sell_settings .auto_sell_settings_add, #sfu_auto_sell_settings .auto_sell_settings_delete {padding: 3px 10px; cursor: pointer}
								   #sfu_auto_sell_settings td:nth-child(7) {border-right: none;} #sfu_auto_sell_settings td:nth-child(8) {border-left: none;}</style>` + html;

			container.oninput = function(event) {
				var td = event.target;
				var name = td.getAttribute("data-name");
				var value = td.textContent;
				if (name == "lowestPrice") {
					if (!value || value.match(/^\d+\.?\d*$/)) {
						if (value) {
							value = parseFloat(value).toString();
						}
						td.setAttribute("data-value", value);
					} else {
						td.textContent = td.getAttribute("data-value");
					}
				} else if (name != "hashName") {
					if (!value || value.match(/^\d+$/)) {
						td.setAttribute("data-value", value);
					} else {
						td.textContent = td.getAttribute("data-value");
					}
				} else {
					td.setAttribute("data-value", value.trim());
				}
			}

			container.onclick = function(event) {
				var elem = event.target;
				if (elem.classList.contains("auto_sell_settings_add")) {
					container.querySelector("tbody").innerHTML += createRow();
					modal.AdjustSizing();
				} else if (elem.classList.contains("auto_sell_settings_delete")) {
					var row = elem.parentNode;
					row.parentNode.removeChild(row);
					autoSellNum = 0;
					for (var td of container.querySelectorAll(".auto_sell_settings_number")) {
						td.textContent = ++autoSellNum;
					}
					modal.AdjustSizing();
				} else if (elem.classList.contains("auto_sell_settings_info")) {
					var parentElem = elem.parentNode;
					var appid = parentElem.querySelector("td[data-name=appid]").getAttribute("data-value");
					var hashName = parentElem.querySelector("td[data-name=hashName]").getAttribute("data-value");
					if (appid && hashName) {
						dialogPriceInfo.show(appid, encodeMarketHashName(hashName), currencyInfo, null, null, null);
					}
				}
			}

			var modal = unsafeWindow.ShowConfirmDialog("自动出售设置", container, "保存").done(function() {
				var index = 1;
				var newSettngs = [];
				for (var row of container.querySelectorAll("#sfu_auto_sell_settings tbody tr")) {
					var itemSet = { index: index++ };
					for (var td of row.querySelectorAll("td")) {
						var name = td.getAttribute("data-name");
						if (name) {
							itemSet[name] = td.getAttribute("data-value");
						}
					}
					newSettngs.push(itemSet);
				}
				setStorageValue("SFU_AUTO_SELL_SETTINGS", newSettngs);
				autoSellNextTime = {};
			});

			if (addItemSetting) {
				var td = container.querySelector(`td[data-value="${addItemSetting.hashName}"]`);
				td?.focus();
			}

			function createRow(item={}) {
				var row = [`<td class="auto_sell_settings_number">${++autoSellNum}</td>`];
				for (var key of ["appid", "contextid", "hashName", "samePriceNum", "threshold", "lowestPrice", "interval"]) {
					row.push(`<td class="auto_sell_settings_input" contenteditable="true" data-name="${key}" data-value="${item[key] ?? ""}">${item[key] ?? ""}</td>`);
				}

				var currency = item.currency ?? currencyInfo.eCurrencyCode;
				var strSymbol = getCurrencyInfo(getCurrencyCode).strSymbol;
				row.splice(6, 0, `<td class="auto_sell_settings_info" data-name="currency" data-value="${currency}">${strSymbol}</td>`);
				row.push(`<td class="auto_sell_settings_delete" title="删除">-</td>`);
				return `<tr>${row.join("")}</tr>`;
			}
		}

		function addToAutoSell(event, selectedItem) {
			var setting = {
				appid: selectedItem.appid,
				contextid: selectedItem.contextid,
				hashName: selectedItem.description.market_hash_name
			}
			autoSellSettingsDialog(setting);
		}

		function checkAutoSellItem() {
			autoSellTimer = setTimeout(async function() {
				var autoSellNextTimeTemp = autoSellNextTime;
				var autoSellSettings = getStorageValue("SFU_AUTO_SELL_SETTINGS") ?? [];
				for (var itemSettings of autoSellSettings) {
					var nextTime = autoSellNextTimeTemp[itemSettings.index] ?? 0;
					var now = Date.now();
					if (itemSettings.appid && itemSettings.contextid && itemSettings.hashName && itemSettings.samePriceNum > 0 && itemSettings.threshold > 0 && 
						itemSettings.lowestPrice > 0 && itemSettings.interval > 0 && itemSettings.currency == currencyInfo.eCurrencyCode && now > nextTime) {
						var res = await autoSellItem(itemSettings);
						autoSellNextTimeTemp[itemSettings.index] = Date.now() + (res? itemSettings.interval: 1) * 60000;
						await sleep(1000);
					}
				}
				checkAutoSellItem();
			}, 60 * 1000);
		}

		async function autoSellItem(itemSettings) {
			var m_rgAssets = unsafeWindow.g_rgAppContextData?.[itemSettings.appid]?.rgContexts?.[itemSettings.contextid]?.inventory?.m_rgAssets;
			var url = `https://steamcommunity.com/market/listings/${itemSettings.appid}/${encodeMarketHashName(itemSettings.hashName)}`;
			var doc = await getHtmlDocument(url);
			if (doc && doc.querySelector("#tabContentsMyActiveMarketListingsTable")) {
				var res = doc.body.innerHTML.match(/Market_LoadOrderSpread\(\s?(\d+)\s?\)/);
				if (res && res.length > 1) {
					var itemNameId = res[1];
					var itemgram = await getItemOrdersHistogram(currencyInfo.country, currencyInfo.eCurrencyCode, itemNameId);
					if (itemgram && itemgram.success == 1 && itemgram.sell_order_graph?.length > 0) {
						var priceNum = {};
						for(var row of doc.querySelectorAll("#tabContentsMyActiveMarketListingsRows .market_listing_row")) {
							var price = getPriceFromSymbolStr(row.querySelector("span.market_listing_price").firstElementChild.firstElementChild.textContent);
							priceNum[price] = (priceNum[price] ?? 0) + 1;
						}

						var sellGraph = itemgram.sell_order_graph;
						for (var sell of sellGraph) {
							sell[0] = Math.round(sell[0] * 100);
						}

						var newPrice = getNewPrice(sellGraph, priceNum, itemSettings.threshold) || getNewPrice(getSellGraphFromTable(itemgram.sell_order_table), priceNum, itemSettings.threshold);
						if (newPrice > 0) {							
							var newPriceReceive = calculatePriceYouReceive(Math.max(newPrice, Math.round(itemSettings.lowestPrice * 100)));
							newPrice = calculatePriceBuyerPay(newPriceReceive);
							var newNum = itemSettings.samePriceNum;
							for (var prc in priceNum) {
								if (prc <= newPrice) {
									newNum -= priceNum[prc];
								}
							}

							if (newNum > 0) {
								var err_flag = false;
								for (let assetid in m_rgAssets) {
									let it = m_rgAssets[assetid];
									if (it?.description?.marketable && it.description.market_hash_name == itemSettings.hashName && !it.element.getAttribute("data-sold")) {
										let result = await sellSelectedItem(0, it, newPriceReceive, newPrice, 1);
										if (result && result.success) {
											newNum--;
										} else {
											err_flag = true;
											break;
										}

										if (newNum <= 0) {
											break;
										}
									}
								}
								if (unsafeWindow.confirmSellItems) {
									unsafeWindow.confirmSellItems();
								}
								return !err_flag;
							}
							return true;
						}
					}
				}
			}
			return false;
		}

		function getNewPrice(sellGraph, priceNum, threshold) {
			for (var sell of sellGraph) {
				for (var prc in priceNum) {
					if (prc <= sell[0]) {
						sell[1] -= priceNum[prc];
					}
				}
			}
	
			for (var sell of sellGraph) {
				if (sell[1] > threshold) {
					return (sell[0] - 1);
				}
			}
	
			return 0;
		}

		function getSellGraphFromTable(tableHtml) {
			var sellGraph = [];
			if (tableHtml) {
				var total = 0;
				var elem = document.createElement("div");
				elem.innerHTML = tableHtml;
				for (var tr of elem.querySelectorAll("tr")) {
					var price = getPriceFromSymbolStr(tr.firstElementChild.textContent);
					var num = parseInt(tr.lastElementChild.textContent);
					if (num > 0) {
						total += num;
						sellGraph.push([price, total]);
					}
				}
				sellGraph.pop();
			}
			return sellGraph;
		}
	}

	//steam市场界面
	function steamMarketPage() {  
		if(!location.href.match(/^https?\:\/\/steamcommunity\.com\/market(?!\/listings|\/search)/)) {
			return;
		}

		addSteamCommunitySetting();
		allMyBuyOrders.load(document);

		var currencyInfo = getCurrencyInfo();
		var marketMyListings = {};
		var marketMyListingsPage = [];  //各页列表

		var buyOrderRowsTimeSort = [];
		var buyOrderRowsNameSort = [];

		var TIME_ASC = 0;
		var TIME_DSC = 1;
		var NAME_ASC = 2;
		var NAME_DSC = 3;
		var PRICE_ASC = 4;
		var PRICE_DSC = 5;
		var sortType = TIME_ASC;
		var currentPage = 1;

		var numTradingCard = 0;
		var numFoilCard = 0;
		var numOther = 0;

		if (globalSettings.market_adjust_listings) {
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `.market_action_btn {padding: 0px 5px; margin-right: 8px; font-size: 12px;} 
								   .control_action_container {padding-left: 6px; display: inline-block; position: relative;}
								   .Listing_page_control {margin-top: 10px; user-select: none;}
								   .Listing_page_control .market_paging_controls {margin-top: 2px;}
								   .market_page_number_container {float: right; margin-top: 1px;}
								   .market_page_number {margin: 0 15px 0 5px; width: 35px; background: transparent; box-shadow: none;}
								   .market_page_number::-webkit-outer-spin-button, .market_page_number::-webkit-inner-spin-button{-webkit-appearance: none !important;}
								   .market_listing_check {position: absolute; top: 15px; right: 20px; cursor: pointer; transform: scale(1.5); }
								   .market_listing_table_header {text-align: center;}
								   .market_listing_game_name_link {color: inherit;} 
								   .market_listing_game_name_link:hover {text-decoration: underline;}
								   .market_price_can_click {cursor: pointer;} .market_price_can_click:hover {background: #324965;}
								   .history_action_btn_container {margin-right: 5px;}
								   .wait_loading_history {position: absolute; height: 20px; top: 2px;}
								   #tabContentsMyListings .market_pagesize_options, #tabContentsMyListings #tabContentsMyActiveMarketListings_ctn {display: none;}
								   #tabContentsMyActiveMarketListingsTable .market_listing_table_header {display: flex; flex-direction: row-reverse;}
								   #tabContentsMyActiveMarketListingsTable .market_listing_table_header span:last-child {flex: 1 1 auto; text-align: center;}
								   #tabContentsMyActiveMarketListingsTable .market_listing_table_header > span {cursor: pointer;}
								   #tabContentsMyActiveMarketListingsTable .market_listing_table_header > span:hover {background: #324965;}
								   #tabContentsMyActiveMarketListingsRows .market_listing_row .market_listing_my_price {cursor: pointer; position: relative;}
								   #tabContentsMyActiveMarketListingsRows .market_listing_row .market_listing_my_price:hover {background: #324965;}
								   .market_price_container {display: inline-block; vertical-align: middle; font-size: 85.7%;}
								   .market_price_label {line-height: normal;}
								   .market_show_filter {font-size: 12px; height: 24px; padding: 0px 5px; margin-left: -5px;}
								   .market_show_filter > option {color: #ffffff; background-color: #333333;}`;
			document.body.appendChild(styleElem);
		}

		if (globalSettings.market_adjust_listings) {
			document.querySelector("#tabMyListings").addEventListener("click", showMarketMyListings, true);
			document.querySelector("#tabMyMarketHistory").addEventListener("click", showMarketHistory, true);
			
			adjustMyBuyOrder();
			adjustConfirmationListing();
			
			adjustMySellListings();
			showMarketMyListings();
		}

		//调整出售物品列表
		async function adjustMySellListings() {
			var marketListings = document.querySelector("#tabContentsMyActiveMarketListingsRows");
			if (!marketListings) {
				return;
			}

			marketListings.innerHTML = "<div style='text-align: center;'><img src='https://community.steamstatic.com/public/images/login/throbber.gif' alt='载入中'></div>";

			//使表头可点击排序
			var tableHeader = document.querySelector("#tabContentsMyActiveMarketListingsTable .market_listing_table_header");
			tableHeader.lastElementChild.classList.add("market_listing_name");
			tableHeader.lastElementChild.innerHTML = tableHeader.lastElementChild.textContent;
			tableHeader.onclick = tableHeaderClick;

			//获取全部出售物品
			var container = document.createElement("div");
			container.style.display = "none";
			document.body.appendChild(container);

			var html = "";
			var totalCount = 0;
			var start = 0;
			if (typeof unsafeWindow.g_oMyListings !== 'undefined' && unsafeWindow.g_oMyListings != null && unsafeWindow.g_oMyListings.m_cTotalCount != null)
				totalCount = unsafeWindow.g_oMyListings.m_cTotalCount;
			else {
				totalCount = parseInt(document.querySelector("#my_market_selllistings_number").textContent);
			}
			
			while (start < totalCount) {
				var data = await getMarketMyListings(start, 100);
				if (data.success) {
					html += data.results_html;
					unsafeWindow.MergeWithAssetArray(data.assets);
				}
				start += 100;
			}
			container.innerHTML = html;

			var totalPay = 0;
			var totalReceive = 0;
			var listings = container.querySelectorAll(".market_listing_row");
			var listingsTemp = [];
			for (var i = 0; i < listings.length; i++) {
				var assetInfo = getListingAssetInfo(listings[i]);
				var gameName = listings[i].querySelector(".market_listing_game_name").textContent.toLowerCase();
				var itemName = listings[i].querySelector(".market_listing_item_name_link").textContent.toLowerCase();
				var pricePay = getPriceFromSymbolStr(listings[i].querySelector(".market_listing_price > span > span:first-child").textContent);
				var pricReceive = getPriceFromSymbolStr(listings[i].querySelector(".market_listing_price  > span > span:last-child").textContent);
				listingsTemp.push([gameName, itemName, pricePay, listings[i]]);

				listings[i].querySelector(".market_listing_my_price").onclick = showListingPriceInfo;
				totalPay += pricePay * assetInfo.amount;
				totalReceive += pricReceive * assetInfo.amount;

				var itemType = "";
				if (assetInfo.appid == 753 && assetInfo.contextid == "6" && gameCardsLink(assetInfo)) {
					if (gameCardsLink(assetInfo).search(/border\=1/) > 0) {
						itemType = "FoilCard";
						numFoilCard++;
					} else {
						itemType = "TradingCard";
						numTradingCard++;
					}
				} else {
					itemType = "Other";
					numOther++;
				}
				listings[i].setAttribute("market_item_type", itemType);

				addRowCheckbox(listings[i]).addEventListener("click", sellListingCheckboxClicked);
				addGameCardsLink(listings[i], assetInfo);
			}

			//添加页面导航
			addMarketPageControl();

			//显示总售价
			if (listings.length == totalCount) {
				document.querySelector("#my_market_selllistings_number").textContent += ` ▶ ${getSymbolStrFromPrice(totalPay, currencyInfo)} ▶ ${getSymbolStrFromPrice(totalReceive, currencyInfo)}`;
			} else {
				document.querySelector("#my_market_selllistings_number").textContent += ` ▶ Error`;
			}

			marketMyListings.timeSort = listingsTemp;
			setListingsPage(marketMyListings.timeSort);

			//根据游戏名和物品名排序
			marketMyListings.nameSort = listingsTemp.slice();
			marketMyListings.nameSort.sort(function(a, b) {
				if (a[0].localeCompare(b[0]) == 0) {
					return a[1].localeCompare(b[1]);
				}
				return a[0].localeCompare(b[0]);
			});

			//根据价格排序
			marketMyListings.priceSort = listingsTemp.slice();
			marketMyListings.priceSort.sort(function(a, b) {
				return a[2] - b[2];
			});

			if (globalSettings.market_show_priceinfo) {
				autoShowPriceInfo(listings);
			}
		}

		//调整求购列表
		function adjustMyBuyOrder() {
			var listingSection = document.querySelectorAll(".my_listing_section");
			var buyOrderListing;
			for (var section of listingSection) {
				var row = section.querySelector(".market_listing_row");
				if (row && row.id.match(/\bmybuyorder_\d+/)) {
					buyOrderListing = section;
					buyOrderListing.classList.add("sfu_my_buy_order");
					break;
				}
			}

			if (!buyOrderListing) {
				return;
			}

			var tabMyBuyOrder = document.createElement("a");
			tabMyBuyOrder.innerHTML = `<span class="market_tab_well_tab_contents">我的订购单</span>`;
			tabMyBuyOrder.id = "tabMyBuyOrder";
			tabMyBuyOrder.className = "market_tab_well_tab market_tab_well_tab_inactive";
			tabMyBuyOrder.style.marginLeft = "3px";
			tabMyBuyOrder.addEventListener("click", showMyBuyOrders);
			document.querySelector("#myMarketTabs .market_tab_well_tabs").appendChild(tabMyBuyOrder);

			buyOrderListing.id = "tabContentsMyBuyOrders";
			document.querySelector("#myListings").appendChild(buyOrderListing);

			var styleElem = document.createElement("style");
			styleElem.innerHTML = ".buy_order_table_header_cell:hover {background: #324965;} .buy_order_table_header_cell {cursor: pointer; flex: 1 1 auto;}";
			buyOrderListing.appendChild(styleElem);

			var buyOrderRows = buyOrderListing.querySelectorAll(".market_listing_row");
			
			var buyOrderTable = document.createElement("div");
			var totalBuy = 0;
			for (var row of buyOrderRows) {
				addRowCheckbox(row).addEventListener("click", buyListingCheckboxClicked);
				addGameCardsLink(row);

				buyOrderTable.appendChild(row);
				buyOrderRowsTimeSort.push(row);

				var priceCell = row.querySelector(".market_listing_my_price:not(.market_listing_buyorder_qty)");
				priceCell.classList.add("market_price_can_click");
				priceCell.onclick = showListingPriceInfo;

				var quantity = row.querySelector(".market_listing_my_price.market_listing_buyorder_qty .market_listing_price").textContent.trim();
				var qty = priceCell.querySelector(".market_listing_inline_buyorder_qty").textContent.trim();
				var price = getPriceFromSymbolStr(priceCell.querySelector(".market_listing_price").textContent.replace(qty, "").trim());
				totalBuy += price * quantity;
			}
			buyOrderListing.appendChild(buyOrderTable);

			var buyOrderNumber = buyOrderListing.querySelector(".my_market_header #my_market_buylistings_number");
			buyOrderNumber.textContent += " ▶ " + getSymbolStrFromPrice(totalBuy, currencyInfo);
			buyOrderNumber.title = "所有求购订单的总金额不能超过钱包余额的10倍";

			buyOrderRowsNameSort = buyOrderRowsTimeSort.slice();
			buyOrderRowsNameSort.sort(function(a, b) {
				var gameName1 = a.querySelector(".market_listing_game_name").textContent.toLowerCase();
				var itemName1 = a.querySelector(".market_listing_item_name_link").textContent.toLowerCase();
				var gameName2 = b.querySelector(".market_listing_game_name").textContent.toLowerCase();
				var itemName2 = b.querySelector(".market_listing_item_name_link").textContent.toLowerCase();
				if (gameName1.localeCompare(gameName2) == 0) {
					return itemName1.localeCompare(itemName2);
				}
				return gameName1.localeCompare(gameName2);
			});

			//使表头可点击排序
			buyOrderListing.querySelector(".market_listing_table_header").style = "display: flex;flex-direction: row-reverse;";
			var tableHeader = buyOrderListing.querySelector(".market_listing_table_header > span:last-child");
			tableHeader.innerHTML = tableHeader.textContent;
			tableHeader.classList.add("buy_order_table_header_cell");
			tableHeader.onclick = function(event) {
				var elem = event.currentTarget;
				var textContent = elem.textContent;
				var rowsToShow = buyOrderRowsTimeSort;
				if (textContent.endsWith("▲")) {
					elem.textContent = textContent.replace("▲", "▼");
					rowsToShow = buyOrderRowsNameSort.slice();
					rowsToShow.reverse();
				} else if (textContent.endsWith("▼")) {
					elem.textContent = textContent.replace(" ▼", "");
				} else {
					elem.textContent = textContent + " ▲";
					rowsToShow = buyOrderRowsNameSort;
				}

				buyOrderTable.innerHTML = "";
				for (var row of rowsToShow) {
					buyOrderTable.appendChild(row);
				}
			};

			addBuyOrderActions();
		}

		//调整确认上架列表
		function adjustConfirmationListing() {
			var listingSection = document.querySelectorAll(".my_listing_section");
			var confirmationListing;
			for (var section of listingSection) {
				var button = section.querySelector(".market_listing_cancel_button a.item_market_action_button_edit");
				if (button && button.href.match(/\bCancelMarketListingConfirmation\b/)) {
					confirmationListing = section;
					confirmationListing.classList.add("sfu_my_confirmation_listing");
					break;
				}
			}

			if (!confirmationListing) {
				return;
			}

			var confirmationRows = confirmationListing.querySelectorAll(".market_listing_row");
			for (var row of confirmationRows) {
				addRowCheckbox(row).addEventListener("click", confirmationListingCheckboxClicked);
				addGameCardsLink(row);
				var priceCell = row.querySelector(".market_listing_my_price:not(.market_listing_buyorder_qty)");
				priceCell.classList.add("market_price_can_click");
				priceCell.onclick = showListingPriceInfo;
			}

			addConfirmationListingActions();
		}

		function showMarketMyListings(event) {
			if (event) {
				event.preventDefault();
				event.stopPropagation();
			}
			document.querySelector("#tabContentsMyListings").show();
			document.querySelector("#tabContentsMyMarketHistory").hide();
			document.querySelector("#tabContentsMyBuyOrders")?.hide();
			document.querySelector("#tabMyListings").addClassName("market_tab_well_tab_active");
			document.querySelector("#tabMyListings").removeClassName("market_tab_well_tab_inactive");
			document.querySelector("#tabMyMarketHistory").addClassName("market_tab_well_tab_inactive");
			document.querySelector("#tabMyMarketHistory").removeClassName("market_tab_well_tab_active");
			document.querySelector("#tabMyBuyOrder")?.addClassName("market_tab_well_tab_inactive");
			document.querySelector("#tabMyBuyOrder")?.removeClassName("market_tab_well_tab_active");
		}

		function showMyBuyOrders() {
			document.querySelector("#tabContentsMyListings").hide();
			document.querySelector("#tabContentsMyMarketHistory").hide();
			document.querySelector("#tabContentsMyBuyOrders")?.show();
			document.querySelector("#tabMyListings").addClassName("market_tab_well_tab_inactive");
			document.querySelector("#tabMyListings").removeClassName("market_tab_well_tab_active");
			document.querySelector("#tabMyMarketHistory").addClassName("market_tab_well_tab_inactive");
			document.querySelector("#tabMyMarketHistory").removeClassName("market_tab_well_tab_active");
			document.querySelector("#tabMyBuyOrder")?.addClassName("market_tab_well_tab_active");
			document.querySelector("#tabMyBuyOrder")?.removeClassName("market_tab_well_tab_inactive");
		}

		//显示市场历史记录
		async function showMarketHistory(event) {
			event.preventDefault();
			event.stopPropagation();
			unsafeWindow.HideHover();
			document.querySelector("#tabContentsMyListings").hide();
			document.querySelector("#tabContentsMyMarketHistory").show();
			document.querySelector("#tabContentsMyBuyOrders")?.hide();
			document.querySelector("#tabMyListings").addClassName("market_tab_well_tab_inactive");
			document.querySelector("#tabMyListings").removeClassName("market_tab_well_tab_active");
			document.querySelector("#tabMyMarketHistory").addClassName("market_tab_well_tab_active");
			document.querySelector("#tabMyMarketHistory").removeClassName("market_tab_well_tab_inactive");
			document.querySelector("#tabMyBuyOrder")?.addClassName("market_tab_well_tab_inactive");
			document.querySelector("#tabMyBuyOrder")?.removeClassName("market_tab_well_tab_active");

			if (document.querySelector("#tabContentsMyMarketHistory #history_page_control_before")) {
				return;
			}

			var res = await getMarketMyHistory();
			if (res.success) {
				document.querySelector("#tabContentsMyMarketHistory").innerHTML = res.results_html;
				addHistoryPageControl();
				updateHistoryPageControl(res);
				addMarketLink(res);
			} else {
				document.querySelector("#tabContentsMyMarketHistory").innerHTML = "Failed";
			}
		}

		async function updateMarketHistory(page, pageSize=10) {
			if (page > 0) {
				document.querySelector("#history_page_control_before .wait_loading_history").style.display = null;
				document.querySelector("#history_page_control_after .wait_loading_history").style.display = null;
				document.querySelector("#history_page_control_before .get_history_failed").style.display = "none";
				document.querySelector("#history_page_control_after .get_history_failed").style.display = "none";
				var start = (page - 1) * pageSize;
				var res = await getMarketMyHistory(start, pageSize);
				if (res.success) {
					document.querySelector("#tabContentsMyMarketHistoryRows").innerHTML = res.results_html;
					updateHistoryPageControl(res);
					addMarketLink(res);
				} else {
					document.querySelector("#history_page_control_before .wait_loading_history").style.display = "none";
					document.querySelector("#history_page_control_after .wait_loading_history").style.display = "none";
					document.querySelector("#history_page_control_before .get_history_failed").style.display = null;
					document.querySelector("#history_page_control_after .get_history_failed").style.display = null;
				}
			}
		}

		function addHistoryPageControl() {
			document.querySelector("#tabContentsMyMarketHistory_ctn").style.display = "none";
			var controlBefore = document.createElement("div");
			controlBefore.className = "Listing_page_control";
			controlBefore.id = "history_page_control_before";
			var controlAfter = document.createElement("div");
			controlAfter.className = "Listing_page_control";
			controlAfter.id = "history_page_control_after";

			var html = `<div class="history_action_btn_container control_action_container"><a class="update_market_history market_action_btn pagebtn">刷新</a>
						<img class="wait_loading_history" src="https://community.steamstatic.com/public/images/login/throbber.gif" alt="载入中" style="display: none;">
						<span class="get_history_failed" style="display: none;">Failed</span></div>
						<div class="market_paging_controls"><span class="pagebtn prev_page"><</span><span class="page_link"></span><span class="pagebtn next_page">></span></div>
						<div class="market_page_number_container"><span style="font-size: 13px;">跳到</span><input type="number" class="market_page_number" min="1" style="color: white;"></div><div style="clear: both;"></div>`;
			controlBefore.innerHTML = html;
			controlAfter.innerHTML = html;
			var marketTable = document.querySelector("#tabContentsMyMarketHistoryTable");
			marketTable.insertBefore(controlBefore, marketTable.querySelector("#tabContentsMyMarketHistoryRows"));
			marketTable.appendChild(controlAfter);
			controlBefore.querySelector(".market_paging_controls").onclick = historyPageControlClick;
			controlAfter.querySelector(".market_paging_controls").onclick = historyPageControlClick;
			controlBefore.querySelector(".history_action_btn_container").onclick = historyActionBtnClick;
			controlAfter.querySelector(".history_action_btn_container").onclick = historyActionBtnClick;
			controlBefore.querySelector(".market_page_number").onkeydown = historyPageNumberEnter;
			controlAfter.querySelector(".market_page_number").onkeydown = historyPageNumberEnter;
		}

		function historyActionBtnClick(event) {
			var elem = event.target;
			if (elem.classList.contains("update_market_history")) {
				updateMarketHistory(1);
			}
		}

		function historyPageControlClick(event) {
			var elem = event.target;
			var cpage = parseInt(event.currentTarget.querySelector(".market_paging_pagelink.active").getAttribute("data-page-num"));
			var maxPage = parseInt(event.currentTarget.querySelector(".market_paging_pagelink:last-child").getAttribute("data-page-num"));
			var page = getNextPage(elem, cpage, maxPage);

			if (page > 0 && page != cpage && page <= maxPage) {
				updateMarketHistory(page);
			}
		}

		function historyPageNumberEnter(event) {
			if (event.keyCode == 13) {
				var nextPage = parseInt(event.target.value);
				nextPage = isNaN(nextPage) ? 1 : nextPage;
				if (nextPage > 0) {
					updateMarketHistory(nextPage);
				}
			}
		}

		function updateHistoryPageControl(data) {
			document.querySelector("#history_page_control_before .wait_loading_history").style.display = "none";
			document.querySelector("#history_page_control_after .wait_loading_history").style.display = "none";
			document.querySelector("#history_page_control_before .get_history_failed").style.display = "none";
			document.querySelector("#history_page_control_after .get_history_failed").style.display = "none";

			var page = Math.ceil(data.start / data.pagesize) + 1;
			var maxPage = Math.ceil(data.total_count / data.pagesize);
			var html = createPageLink(page, maxPage);

			document.querySelector("#history_page_control_before .page_link").innerHTML = html;
			document.querySelector("#history_page_control_after .page_link").innerHTML = html;
			document.querySelector(`#history_page_control_before .page_link .market_paging_pagelink[data-page-num="${page}"]`).classList.add("active");
			document.querySelector(`#history_page_control_after .page_link .market_paging_pagelink[data-page-num="${page}"]`).classList.add("active");

			document.querySelector("#history_page_control_before .market_page_number").value = page.toString();
			document.querySelector("#history_page_control_after .market_page_number").value = page.toString();
		}

		function addBuyOrderActions() {
			var controlBefore = document.createElement("div");
			controlBefore.className = "Listing_page_control";
			controlBefore.id = "buy_order_control_before";
			var controlAfter = document.createElement("div");
			controlAfter.className = "Listing_page_control";
			controlAfter.id = "buy_order_control_after";

			var html = `<div class="control_action_container"><a class="buy_order_select_all market_action_btn pagebtn">全部选中</a><a class="cancel_buy_order market_action_btn pagebtn">取消选中的求购</a></div>`;
			controlBefore.innerHTML = html;
			controlAfter.innerHTML = html;
			var buyOrderListing = document.querySelector(".sfu_my_buy_order");
			buyOrderListing.insertBefore(controlBefore, buyOrderListing.querySelector(".market_listing_table_header"));
			buyOrderListing.appendChild(controlAfter);

			controlBefore.onclick = buyOrderActionsClick;
			controlAfter.onclick = buyOrderActionsClick;
		}

		function buyOrderActionsClick(event) {
			var elem = event.target;
			if (elem.classList.contains("buy_order_select_all")) {
				var selectBtn0 = document.querySelector("#buy_order_control_before .buy_order_select_all");
				var selectBtn1 = document.querySelector("#buy_order_control_after .buy_order_select_all");

				if (elem.classList.contains("checked")) {  //取消选中
					selectBtn0.classList.remove("checked");
					selectBtn1.classList.remove("checked");
					selectBtn0.textContent = "全部选中";
					selectBtn1.textContent = "全部选中";

					for (var row of buyOrderRowsTimeSort) {
						row.querySelector(".market_listing_check").checked = false;
					}
				} else {
					selectBtn0.classList.add("checked");
					selectBtn1.classList.add("checked");
					selectBtn0.textContent = "取消选中";
					selectBtn1.textContent = "取消选中";

					for (var row of buyOrderRowsTimeSort) {
						row.querySelector(".market_listing_check").checked = true;
					}
				}

			} else if (elem.classList.contains("cancel_buy_order")) {
				unsafeWindow.ShowConfirmDialog("取消求购", "确定取消所有选中的求购？").done(function() {
					var rowsToCancel = [];
					for (var row of buyOrderRowsTimeSort) {
						var checkbox = row.querySelector(".market_listing_check");
						if (checkbox.checked && !checkbox.hasAttribute("data-removed")) {
							rowsToCancel.push(row);
						}
					}
					cancelSelectedBuyOrders(rowsToCancel);
				});
			}
		}

		async function cancelSelectedBuyOrders(rowsToCancel) {
			for (var row of rowsToCancel) {
				var btn = row.querySelector("a.item_market_action_button_edit");
				var buyOrderId = eval(btn.href.match(/CancelMarketBuyOrder\(([^\(\)]+)\)/)[1]);
				var buyOrder = allMyBuyOrders.getByOrderid(buyOrderId);

				if (buyOrder) {
					var data = await cancelBuyOrder(buyOrderId, unsafeWindow.g_sessionID);
					if (data.success == 1) {
						row.querySelector(".market_listing_check").setAttribute("data-removed", "true");
						btn.querySelector(".item_market_action_button_contents").textContent = "已取消";
						btn.style.color = "red";
						allMyBuyOrders.delete(buyOrder.appid, buyOrder.market_hash_name);
					}
				} else {
					row.querySelector(".market_listing_check").setAttribute("data-removed", "true");
					btn.querySelector(".item_market_action_button_contents").textContent = "已取消";
					btn.style.color = "red";
				}
			}
		}

		function addConfirmationListingActions() {
			var controlBefore = document.createElement("div");
			controlBefore.className = "Listing_page_control";
			controlBefore.id = "confirmation_control_before";
			var controlAfter = document.createElement("div");
			controlAfter.className = "Listing_page_control";
			controlAfter.id = "confirmation_control_after";

			var html = `<div class="control_action_container"><a class="confirmation_select_all market_action_btn pagebtn">全部选中</a><a class="cancel_confirmation market_action_btn pagebtn">取消选中的确认</a></div>`;
			controlBefore.innerHTML = html;
			controlAfter.innerHTML = html;
			var confirmationListing = document.querySelector(".sfu_my_confirmation_listing");
			confirmationListing.insertBefore(controlBefore, confirmationListing.querySelector(".market_listing_table_header"));
			confirmationListing.appendChild(controlAfter);

			controlBefore.onclick = confirmationListingActionsClick;
			controlAfter.onclick = confirmationListingActionsClick;
		}

		function confirmationListingActionsClick(event) {
			var elem = event.target;
			var confirmationRows = document.querySelectorAll(".sfu_my_confirmation_listing .market_listing_row");
			if (elem.classList.contains("confirmation_select_all")) {
				var selectBtn0 = document.querySelector("#confirmation_control_before .confirmation_select_all");
				var selectBtn1 = document.querySelector("#confirmation_control_after .confirmation_select_all");

				if (elem.classList.contains("checked")) {  //取消选中
					selectBtn0.classList.remove("checked");
					selectBtn1.classList.remove("checked");
					selectBtn0.textContent = "全部选中";
					selectBtn1.textContent = "全部选中";

					for (var row of confirmationRows) {
						row.querySelector(".market_listing_check").checked = false;
					}
				} else {
					selectBtn0.classList.add("checked");
					selectBtn1.classList.add("checked");
					selectBtn0.textContent = "取消选中";
					selectBtn1.textContent = "取消选中";

					for (var row of confirmationRows) {
						row.querySelector(".market_listing_check").checked = true;
					}
				}

			} else if (elem.classList.contains("cancel_confirmation")) {
				unsafeWindow.ShowConfirmDialog("取消确认", "确定取消所有选中的待确认物品？").done(function() {
					var rowsToCancel = [];
					for (var row of confirmationRows) {
						var checkbox = row.querySelector(".market_listing_check");
						if (checkbox.checked && !checkbox.hasAttribute("data-removed")) {
							rowsToCancel.push(row);
						}
					}
					cancelSelectedConfirmation(rowsToCancel);
				});
			}
		}

		//列表上下添加操作按键和页面导航
		function addMarketPageControl() {
			var styleElem = document.createElement("style");
			styleElem.id = "market_page_control_style";
			document.body.appendChild(styleElem);

			var controlBefore = document.createElement("div");
			controlBefore.className = "Listing_page_control";
			controlBefore.id = "market_page_control_before";
			var controlAfter = document.createElement("div");
			controlAfter.className = "Listing_page_control";
			controlAfter.id = "market_page_control_after";

			var numAll = numFoilCard + numOther + numTradingCard;
			var html = `<div class="market_action_btn_container control_action_container"><a class="market_select_all market_action_btn pagebtn">选中全部物品</a><a class="market_remove_listing market_action_btn pagebtn">下架选中物品</a></div>
						<select class="market_show_filter pagebtn"><option value="All">全部物品 (${numAll})</option><option value="TradingCard">普通卡牌 (${numTradingCard})</option><option value="FoilCard">闪亮卡牌 (${numFoilCard})</option><option value="Other">其他物品 (${numOther})</option></select>
						<div class="market_paging_controls"><span class="pagebtn prev_page"><</span><span class="page_link"></span><span class="pagebtn next_page">></span></div>
						<div class="market_page_number_container"><span style="font-size: 13px;">跳到</span><input type="number" class="market_page_number" min="1" style="color: white;"></div><div style="clear: both;"></div>`;
			controlBefore.innerHTML = html;
			controlAfter.innerHTML = html;
			var marketTable = document.querySelector("#tabContentsMyActiveMarketListingsTable");
			marketTable.insertBefore(controlBefore, marketTable.querySelector(".market_listing_table_header"));
			marketTable.appendChild(controlAfter);
			controlBefore.querySelector(".market_paging_controls").onclick = marketPageControlClick;
			controlAfter.querySelector(".market_paging_controls").onclick = marketPageControlClick;
			controlBefore.querySelector(".market_action_btn_container").onclick = marketActionBtnClick;
			controlAfter.querySelector(".market_action_btn_container").onclick = marketActionBtnClick;
			controlBefore.querySelector(".market_show_filter").onchange = showFilterChanged;
			controlAfter.querySelector(".market_show_filter").onchange = showFilterChanged;
			controlBefore.querySelector(".market_page_number").onkeydown = marketPageNumberEnter;
			controlAfter.querySelector(".market_page_number").onkeydown = marketPageNumberEnter;
		}

		//更新页面导航中的页面编号
		function updateMarketPageControl(page) {
			var maxPage = marketMyListingsPage.length;
			var html = createPageLink(page, maxPage);

			document.querySelector("#market_page_control_before .page_link").innerHTML = html;
			document.querySelector("#market_page_control_after .page_link").innerHTML = html;
			document.querySelector(`#market_page_control_before .page_link .market_paging_pagelink[data-page-num="${page}"]`).classList.add("active");
			document.querySelector(`#market_page_control_after .page_link .market_paging_pagelink[data-page-num="${page}"]`).classList.add("active");
			document.querySelector("#market_page_control_before .market_page_number").value = page;
			document.querySelector("#market_page_control_after .market_page_number").value = page;
		}

		function marketPageControlClick(event) {
			var elem = event.target;
			var maxPage = marketMyListingsPage.length;
			var page = getNextPage(elem, currentPage, maxPage);

			if (page > 0 && page != currentPage && page <= maxPage) {
				showMarketPage(page);
				updateMarketPageControl(page);
			}
		}

		function showFilterChanged(event) {
			var elem = event.target;
			var showType = elem.value;
			var html = "";
			if (showType != "All") {
				html = `#tabContentsMyActiveMarketListingsRows > .market_listing_row:not([market_item_type=${showType}]) {display: none;}`
			}
			document.querySelector("#market_page_control_style").innerHTML = html;

			for (var el of document.querySelectorAll("select.market_show_filter")) {
				el.value = showType;
			}
		}

		function marketActionBtnClick(event) {
			var elem = event.target;
			if (elem.classList.contains("market_select_all")) {
				var selectBtn0 = document.querySelector("#market_page_control_before .market_select_all");
				var selectBtn1 = document.querySelector("#market_page_control_after .market_select_all");
				if (elem.classList.contains("checked")) {  //取消选中
					selectBtn0.classList.remove("checked");
					selectBtn1.classList.remove("checked");
					selectBtn0.textContent = "选中全部物品";
					selectBtn1.textContent = "选中全部物品";

					for (var item of marketMyListings.timeSort) {
						item[3].querySelector(".market_listing_check").checked = false;
					}
				} else {
					selectBtn0.classList.add("checked");
					selectBtn1.classList.add("checked");
					selectBtn0.textContent = "取消选中物品";
					selectBtn1.textContent = "取消选中物品";

					var showType = document.querySelector("select.market_show_filter").value;
					for (var item of document.querySelectorAll(`#tabContentsMyActiveMarketListingsRows > .market_listing_row${showType != "All"? `[market_item_type=${showType}]`: ""}`)) {
						item.querySelector(".market_listing_check").checked = true;
					}
				}
			} else if (elem.classList.contains("market_remove_listing")) {
				unsafeWindow.ShowConfirmDialog("批量下架", "确定下架所有选中的物品？").done(function() {
					var listingsToRemove = [];
					for (var item of marketMyListings.timeSort) {
						var listing = item[3];
						var checkbox = listing.querySelector(".market_listing_check");
						if (checkbox.checked && !checkbox.hasAttribute("data-removed")) {
							listingsToRemove.push(listing);
						}
					}
					removeSelectedListings(listingsToRemove);
				});
			}
		}

		function marketPageNumberEnter(event) {
			if (event.keyCode == 13) {
				var nextPage = parseInt(event.target.value);
				var maxPage = marketMyListingsPage.length;
				if (!isNaN(nextPage) && nextPage > 0 && nextPage != currentPage && nextPage <= maxPage) {
					showMarketPage(nextPage);
					updateMarketPageControl(nextPage);
				}
			}
		}

		function createPageLink(page, maxPage) {
			var html = `<span class="market_paging_pagelink" data-page-num="1"> 1 </span>`;
			var begin = 2;
			var end = maxPage - 1;

			if (maxPage > 9) {
				if (page <= 5) {
					end = 7;
				} else if (page >= maxPage - 4) {
					begin = maxPage - 6;
				} else {
					begin = page - 2;
					end = page + 2;
				}
			}

			if (begin > 3) {
				html += `<span class="market_paging_pagelink" data-page-num="-1"> ⋯ </span>`;
			}
			for (var i = begin; i <= end; i++) {
				html += `<span class="market_paging_pagelink" data-page-num="${i}"> ${i} </span>`;
			}
			if (end < maxPage - 2) {
				html += `<span class="market_paging_pagelink" data-page-num="-2"> ⋯ </span>`;
			}
			if (maxPage > 1) {
				html += `<span class="market_paging_pagelink" data-page-num="${maxPage}"> ${maxPage} </span>`;
			}
			return html;
		}

		function getNextPage(elem, cpage, maxPage) {
			var page = 0;
			if (elem.classList.contains("prev_page")) {
				page = cpage - 1;
			} else if (elem.classList.contains("next_page")) {
				page = cpage + 1;
			} else if (elem.classList.contains("market_paging_pagelink")) {
				page = parseInt(elem.getAttribute("data-page-num"));
				if (page == -1) {  //向前跳转5页
					page = Math.max(1, cpage - 5);
				} else if (page == -2) {  //向后跳转5页
					page = Math.min(maxPage, cpage + 5);
				}
			}
			return page;
		}

		//市场历史记录添加链接
		function addMarketLink(data) {
			if (data.assets) {
				var assets = [];
				for (var appid in data.assets) {
					for (var contextid in data.assets[appid]) {
						for (var assetid in data.assets[appid][contextid]) {
							assets.push(data.assets[appid][contextid][assetid]);
						}
					}
				}

				var historyRows = document.querySelectorAll("#tabContentsMyMarketHistoryRows .market_listing_row");
				for (var row of historyRows) {
					var nameElem = row.querySelector(".market_listing_item_name");
					var itemImg = row.querySelector(".market_listing_item_img");
					if (itemImg) {
						var assetInfo = null;
						for (var ass of assets) {
							if (ass.icon_url && itemImg.src.includes(ass.icon_url)) {
								assetInfo = ass;
								break;
							}
						}

						if (assetInfo) {
							var hashName = getMarketHashName(assetInfo);
							nameElem.innerHTML = `<a class="market_listing_item_name_link" href="https://steamcommunity.com/market/listings/${assetInfo.appid}/${hashName}" target="_blank">${nameElem.innerHTML}</a>`;
							
							var priceElem = row.querySelector(".market_listing_their_price");
							priceElem.classList.add("market_price_can_click");
							priceElem.onclick = showListingPriceInfo2;
							if (!priceElem.querySelector(".market_listing_price").textContent.trim()) {
								priceElem.querySelector(".market_listing_price").textContent = "...";
							}
							
							addGameCardsLink(row, assetInfo);
						}
					}
				}
			}
		}

		function getListingAssetInfo(listing) {
			var args = listing.querySelector("a.item_market_action_button_edit").href.match(/\bRemoveMarketListing\(([^\(\)]+)\)/)[1].replace(/ /g, "").split(",");
			return unsafeWindow.g_rgAssets[eval(args[2])][eval(args[3])][eval(args[4])];
		}

		//在物品右侧添加复选框
		function addRowCheckbox(elem) {
			var checkbox = document.createElement("input");
			checkbox.setAttribute("type", "checkbox");
			checkbox.className = "market_listing_check";
			elem.querySelector(".market_listing_cancel_button").appendChild(checkbox);
			return checkbox;
		}

		function sellListingCheckboxClicked(event) {
			checkboxShiftSelected(event, "#tabContentsMyActiveMarketListingsRows .market_listing_row .market_listing_check");
		}

		function buyListingCheckboxClicked(event) {
			checkboxShiftSelected(event, "#tabContentsMyBuyOrders .market_listing_row .market_listing_check");
		}

		function confirmationListingCheckboxClicked(event) {
			checkboxShiftSelected(event, ".sfu_my_confirmation_listing .market_listing_row .market_listing_check");
		}

		//在价格右侧显示最低售价和最高求购价
		function addPriceLabel(listing, data, currency) {
			if (data && currency.strCode == currencyInfo.strCode) {
				var elem = listing.querySelector(".market_price_container");
				if (!elem) {
					elem = document.createElement("div");
					elem.className = "market_price_container";
					listing.querySelector(".market_listing_my_price").appendChild(elem);
				}
				var sellPrice = "null";
				var buyPrice = "null";
				if (data.lowest_sell_order) {
					sellPrice = getSymbolStrFromPrice(parseInt(data.lowest_sell_order), currency);
				}
				if (data.highest_buy_order) {
					buyPrice = getSymbolStrFromPrice(parseInt(data.highest_buy_order), currency);
				}
	
				elem.innerHTML = `<div class="market_price_label" title="最低出售价格">${sellPrice}</div><div class="market_price_label" title="最高求购价格">${buyPrice}</div>`;	
			}
		}

		//点击表头排序
		function tableHeaderClick(event) {
			var elem = event.target;
			var symbol = "";
			var reverse = false;
			var listings;
			if (elem.classList.contains("market_listing_my_price")) {
				if (sortType == PRICE_ASC) {
					sortType = PRICE_DSC;
					symbol = " ▼";
					reverse = true;
				} else {
					sortType = PRICE_ASC;
					symbol = " ▲";
				}
				listings = marketMyListings.priceSort;
			} else if (elem.classList.contains("market_listing_listed_date")) {
				if (sortType == TIME_ASC) {
					sortType = TIME_DSC;
					symbol = " ▼";
					reverse = true;
				} else {
					sortType = TIME_ASC;
					symbol = " ▲";
				}
				listings = marketMyListings.timeSort;
			} else if (elem.classList.contains("market_listing_name")) {
				if (sortType == NAME_ASC) {
					sortType = NAME_DSC;
					symbol = " ▼";
					reverse = true;
				} else {
					sortType = NAME_ASC;
					symbol = " ▲";
				}
				listings = marketMyListings.nameSort;
			}

			if (listings) {
				var cells = document.querySelectorAll("#tabContentsMyActiveMarketListingsTable .market_listing_table_header > span");
				for (var el of cells) {
					el.textContent = el.textContent.replace(" ▲", "").replace(" ▼", "");
				}
				elem.textContent += symbol;
				setListingsPage(listings, reverse);
			}
		}

		//弹窗显示物品的市场价格信息
		function showListingPriceInfo(event, add=true) {
			var listing = event.currentTarget.parentNode;
			var res = listing.querySelector("a.market_listing_item_name_link").href.match(/steamcommunity\.com\/market\/listings\/(\d+)\/([^\/\?\&\#\=]+)/);
			var appid = res[1];
			var marketHashName = encodeMarketHashName(res[2]);
			dialogPriceInfo.show(appid, marketHashName, currencyInfo, function(data, currency) {
				if (add) {
					addPriceLabel(listing, data, currency);
				}
			});
		}

		function showListingPriceInfo2(event) {
			showListingPriceInfo(event, false);
		}

		//用给定的列表设置显示物品页面，用于显示对应排序的页面
		function setListingsPage(listings, reverse) {
			if (reverse) {
				listings = listings.slice();
				listings.reverse();
			}
			marketMyListingsPage = [];
			var start = 0;
			while (start < listings.length) {
				marketMyListingsPage.push(listings.slice(start, start + globalSettings.market_page_size));
				start += globalSettings.market_page_size;
			}
			showMarketPage(1);
			updateMarketPageControl(1);
		}

		//显示指定页面的物品列表
		function showMarketPage(page) {
			var container = document.querySelector("#tabContentsMyActiveMarketListingsRows");
			container.style.display = "none";
			container.innerHTML = "";
			for (var row of marketMyListingsPage[page - 1]) {
				container.appendChild(row[3]);
			}
			container.style.display = null;
			currentPage = page;
		}

		//自动显示最低出售价格和最高求购价格
		async function autoShowPriceInfo(listings) {
			var currencyInfo2 = getCurrencyInfo(globalSettings.second_currency_code);
			for (let listing of listings) {
				var assetInfo = getListingAssetInfo(listing);
				var hashName = getMarketHashName(assetInfo);
				var data = await getCurrentItemOrdersHistogram(currencyInfo.country, currencyInfo.eCurrencyCode, assetInfo.appid, hashName);
				addPriceLabel(listing, data, currencyInfo);
				dialogPriceInfo.checkUpdateItemOrdersHistogram(assetInfo.appid, hashName, data, currencyInfo, currencyInfo2);
			}
		}
	}

	//steam物品市场界面
	function steamMarketListingPage() {  
		if(!location.href.match(/^https?\:\/\/steamcommunity\.com\/market\/listings\//)) {
			return;
		}

		if (!(Object.prototype.toString.call(unsafeWindow.g_rgAssets) === "[object Object]")) {  //在获取该物品的列表时发生了一个错误。请稍后再试。
			if (document.body.innerHTML.match(/Market_LoadOrderSpread\(\s?\d+\s?\)/)) {
				setTimeout(function() { location.reload(); }, 1000);
			}
		}

		addSteamCommunitySetting();

		//修改页面布局
		if (globalSettings.marketlisting_set_style) {
			changeMarketListingPage();
		}

		//添加销量信息
		if (globalSettings.marketlisting_show_priceoverview) {
			showPriceOverview();
		}

		//添加商店页面链接按键
		if (globalSettings.marketlisting_append_linkbtn) {
			appendMarketlistingPageLinkBtn();
		}

		function changeMarketListingPage() {  //修改页面布局
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `div.market_header_bg {display: none;}
									div.market_listing_largeimage, div.market_listing_largeimage>img {width: 120px; height: 120px;}
									div#largeiteminfo_content {min-height: 50px; margin-bottom: 0px;}
									a.market_commodity_buy_button {margin: 10px;}
									a.market_commodity_buy_button>span {line-height: 25px; font-size: 15px;}
									div.market_commodity_order_summary, div.market_commodity_orders_header {min-height: 0px;}
									div.market_commodity_explanation {margin: 10px;}
									div.market_commodity_orders_block {min-height: 0px;}
									div.my_listing_section {margin: 0px;}
									div#largeiteminfo_item_descriptors {overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 0px;}
									div#largeiteminfo_warning {margin: 0px 18px;}
									div#largeiteminfo_item_actions > a {margin-bottom: 0px;}
									.market_listing_check {position: absolute; top: 15px; right: 20px; cursor: pointer; transform: scale(1.5); }
									#market_page_control_before {margin-top: 10px; user-select: none;}
									.market_action_btn_container {display: inline-block; padding-left: 6px;}
									.market_action_btn {margin-right: 10px; font-size: 12px;}
									.market_listing_num {font-size: 12px; position: absolute; right: 55px; top: 15px;}`;
			document.body.appendChild(styleElem);
		
			//最新动态移到页面最后
			var activity_section = document.querySelector("div#market_activity_section");
			if (activity_section) {
				document.querySelector("div.market_listing_iteminfo").appendChild(activity_section);
			}

			addRowCheckbox();
			addSellListingControl();
		}

		//在物品右侧添加复选框
		function addRowCheckbox() {
			var listingRows = document.querySelector("#tabContentsMyActiveMarketListingsTable #tabContentsMyActiveMarketListingsRows");
			if (listingRows) {
				var num = 1;
				for (var elem of listingRows.querySelectorAll(".market_listing_row")) {
					var numLabel = document.createElement("span");
					numLabel.className = "market_listing_num";
					numLabel.textContent = num;
					elem.querySelector(".market_listing_cancel_button").appendChild(numLabel);
					num++;

					var checkbox = document.createElement("input");
					checkbox.setAttribute("type", "checkbox");
					checkbox.className = "market_listing_check";
					elem.querySelector(".market_listing_cancel_button").appendChild(checkbox);
					checkbox.addEventListener("click", checkboxClicked);
				}
			}
		}

		function checkboxClicked(event) {
			checkboxShiftSelected(event, "#tabContentsMyActiveMarketListingsRows .market_listing_row .market_listing_check");
		}

		//出售列表上添加操作按键
		function addSellListingControl() {
			var table = document.querySelector("#tabContentsMyActiveMarketListingsTable");
			if (table) {
				var header = table.querySelector(".market_listing_table_header");
				if (header) {
					var controlBefore = document.createElement("div");
					controlBefore.id = "market_page_control_before";
					var html = `<div class="market_action_btn_container"><a class="market_select_all market_action_btn pagebtn">选中全部物品</a><a class="market_remove_listing market_action_btn pagebtn">下架选中物品</a></div>`;
					controlBefore.innerHTML = html;
					table.insertBefore(controlBefore, header);
					controlBefore.querySelector(".market_action_btn_container").onclick = marketActionBtnClick;
				}
			}
		}

		function marketActionBtnClick(event) {
			var elem = event.target;
			var rows = document.querySelectorAll("#tabContentsMyActiveMarketListingsTable #tabContentsMyActiveMarketListingsRows .market_listing_row");
			if (rows.length == 0) {
				return;
			}
			if (elem.classList.contains("market_select_all")) {
				var selectBtn0 = document.querySelector("#market_page_control_before .market_select_all");
				if (elem.classList.contains("checked")) {  //取消选中
					selectBtn0.classList.remove("checked");
					selectBtn0.textContent = "选中全部物品";
					for (var item of rows) {
						item.querySelector(".market_listing_check").checked = false;
					}
				} else {
					selectBtn0.classList.add("checked");
					selectBtn0.textContent = "取消选中物品";
					for (var item of rows) {
						item.querySelector(".market_listing_check").checked = true;
					}
				}
			} else if (elem.classList.contains("market_remove_listing")) {
				unsafeWindow.ShowConfirmDialog("批量下架", "确定下架所有选中的物品？").done(function() {
					var listingsToRemove = [];
					for (var item of rows) {
						var checkbox = item.querySelector(".market_listing_check");
						if (checkbox.checked && !checkbox.hasAttribute("data-removed")) {
							listingsToRemove.push(item);
						}
					}
					removeSelectedListings(listingsToRemove);
				});
			}
		}

		async function showPriceOverview() {  //添加销量信息
			var assetInfo = getAssetInfo();
			
			if (!assetInfo) {
				return;
			}

			var styleElem = document.createElement("style");
			styleElem.innerHTML = "div.price_overview {margin: 10px 10px 0px 10px;} div.price_overview>span {margin-right: 50px;}";
			document.body.appendChild(styleElem);

			var elem = document.createElement("div");
			elem.className = "price_overview";

			var market_commodity_order_block = document.querySelector("div.market_commodity_order_block");
			if (market_commodity_order_block) {
				market_commodity_order_block.appendChild(elem);
			}
			
			var market_buyorder_info = document.querySelector("div#market_buyorder_info");
			if (market_buyorder_info) {
				market_buyorder_info.appendChild(elem);
			}

			var appid = assetInfo.appid;
			var marketHashName = getMarketHashName(assetInfo);
			var currencyInfo = getCurrencyInfo();
		
			var data = await getCurrentPriceOverview(currencyInfo.country, currencyInfo.eCurrencyCode, appid, marketHashName, true);
			if (data) {
				if (data.success) {
					var html = "";
					html += data.lowest_price ? `<span>最低售价：${data.lowest_price}</span>` : "";
					html += data.volume ? `<span>24小时内销量：${data.volume} 个</span>` : "";
					html += data.median_price ? `<span>上一小时售价中位数：${data.median_price}</span>` : "";
				} else {
					var html = `<span>${errorTranslator(data)}</span>`;
				}
				elem.innerHTML = html;
			}
		}

		function appendMarketlistingPageLinkBtn() {  //添加链接按键
			var assetInfo = getAssetInfo();

			if (assetInfo && assetInfo.appid == 753) {
				var appid = assetInfo.market_fee_app;
				var isFoil = location.href.search(/(%28Foil%29|%28Foil%20Trading%20Card%29|\(Foil\)|\(Foil%20Trading%20Card\))/i) > 0;
				var link = gameCardsLink(assetInfo) || `https://steamcommunity.com/my/gamecards/${appid}/${isFoil? "?border=1" : ""}`;
				var linkElem = document.createElement("div");
				linkElem.style.marginLeft = "10px";
				linkElem.innerHTML = `<style>.page_link_btn {border-radius: 2px; cursor: pointer; background: black; color: white; margin: 10px 5px 0px 0px; display: inline-block;} .page_link_btn > span {padding: 0px 15px; font-size: 14px; line-height: 25px;} .page_link_btn:hover {background: rgba(102, 192, 244, 0.4)}</style>
										<a href="${link}" class="page_link_btn" target="_blank"><span>打开徽章页面</span></a>
										<a href="https://store.steampowered.com/app/${appid}" class="page_link_btn" target="_blank"><span>打开商店页面</span></a>
										<a href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${appid}" class="page_link_btn" target="_blank"><span>打开Exchange页面</span></a>
										<a href="https://steamcommunity.com/market/search?appid=753&category_753_Game[]=tag_app_${appid}" class="page_link_btn" target="_blank"><span>查看该游戏社区物品</span></a>`;
				var market_commodity_order_block = document.querySelector("div.market_commodity_order_block");
				if (market_commodity_order_block) {
					market_commodity_order_block.appendChild(linkElem);
				}
			}
		}

		function getAssetInfo() {
			var assets = unsafeWindow.g_rgAssets;

			if (!(Object.prototype.toString.call(assets) === "[object Object]")) {
				return null;
			}

			for (var appid in assets) {
				for (var contextid in assets[appid]) {
					for (var assetid in assets[appid][contextid]) {
						return assets[appid][contextid][assetid];
					}
				}
			}
		}
	}

	//steam徽章界面
	async function steamGameCardsPage() {  
		if(!location.href.match(/^https?\:\/\/steamcommunity\.com\/(id|profiles)\/[^\/]+\/gamecards\b/)) {
			return;
		}

		var marketPage = await getHtmlDocument("https://steamcommunity.com/market/");
		if (!unsafeWindow.g_rgWalletInfo) {
			unsafeWindow.g_rgWalletInfo = await getWalletInfo(marketPage);
		}

		addSteamCommunitySetting();
		var currencyInfo = getCurrencyInfo();

		var myBuyOrderTotalAmount = null;

		//修改页面布局
		if (globalSettings.gamecards_set_style) {
			changeGameCardsPage();
		}

		//添加链接按键
		if (globalSettings.gamecards_show_priceoverview || globalSettings.gamecards_append_linkbtn) {
			appendCardsPageLinkBtn();
			cardsAddInfoBtn();
			appendMyBuyOrders(marketPage);
		}

		//修改页面布局
		function changeGameCardsPage() {  
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `div.badge_card_to_collect_links {text-align-last: right;}
									div.game_card_unowned_border {display: none;}
									div.badge_card_set_card {width: 146px; margin-bottom: 10px;}
									div.game_card_ctn {height: 170px;}`;
			document.body.appendChild(styleElem);

			var cardElems = document.querySelectorAll("div.badge_card_set_card");
			cardElems.forEach(el => {
				el.classList.remove("unowned");
				el.classList.add("owned");
			});
		}

		//添加多个网页的链接
		function appendCardsPageLinkBtn() {
			var res = location.href.match(/\/gamecards\/(\d+)/);
			if (res && res.length > 1) {
				var appid = res[1];
			} 

			var buttons = document.createElement("div");
			buttons.style = "margin: -6px 0 14px 8px";
			buttons.innerHTML = `<a class="btn_grey_grey btn_medium" href="https://store.steampowered.com/app/${appid}" target="_blank"><span>打开商店页面</span></a>
								 <a class="btn_grey_grey btn_medium" href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${appid}" target="_blank"><span>打开Exchange页面</span></a>
								 <a class="btn_grey_grey btn_medium" href="https://steamcommunity.com/market/search?appid=753&category_753_Game[]=tag_app_${appid}" target="_blank"><span>查看该游戏社区物品</span></a>
								 <a class="btn_grey_grey btn_medium" id="multi_buy_order" style="display: none;"><span>批量购买卡牌</span></a>`;

			buttons.querySelector("#multi_buy_order").onclick = showMultiCreateBuyOrder;
			var elem = document.querySelector("div.badge_detail_tasks>div.badge_card_set_cards");
			if (elem) {
				elem.parentNode.insertBefore(buttons, elem);
			}
		}

		//卡牌下方添加链接和价格
		async function cardsAddInfoBtn() {
			var styleElem = document.createElement("style");
			styleElem.innerHTML = ".market_link {display: block; color: #EBEBEB; font-size: 12px; background: #00000066; padding: 3px; text-align: center;} .market_link:hover {background: #7bb7e355;}";
			document.body.appendChild(styleElem);

			var multiBuyOrderBtn = document.querySelector(".badge_detail_tasks #multi_buy_order");
			var gameid = getGameId();

			var res1 = location.search.match(/\bborder=(\d)/);
			if (res1 && res1.length > 1) {
				var cardborder = res1[1];
			} else {
				var cardborder = 0;
			}

			var cardElems = document.querySelectorAll("div.badge_card_set_card");
			var linkElems = document.querySelectorAll("div.gamecards_inventorylink>a");
			for (var le of linkElems) {
				var hashNameList = le.href.match(/(?<=items\[\]\=).+?(?=\&)/g) || decodeURI(le.href.replace(/\+/g, "%20")).match(/(?<=items\[\]\=).+?(?=\&)/g);
				if (hashNameList && hashNameList.length > 0) {
					break;
				}
			}

			if (hashNameList && hashNameList.length > 0 && hashNameList.length == cardElems.length) {
				for (var i = 0; i < cardElems.length; i++) {
					var cardElem = cardElems[i];
					var hashName = encodeMarketHashName(hashNameList[i]);

					var icon = cardElem.querySelector("img.gamecard").src;
					var title1 = cardElem.querySelector(".badge_card_set_title").textContent.replace(cardElem.querySelector(".badge_card_set_text_qty")?.textContent, "").trim();

					let html = `<a class="market_link open_market_page" href="https://steamcommunity.com/market/listings/753/${hashName}" target="_blank">打开市场页面</a>
								<a class="market_link show_market_info" data-market-hash-name="${hashName}" style="margin-top: 5px;">查看市场价格</a>`;
					
					cardElem.lastElementChild.innerHTML = html;
					cardElem.lastElementChild.onclick = showMarketPriceTable;

					cardElem.asset = {
						appid: 753,
						icon: icon,
						market_name: title1,
						market_hash_name: decodeURIComponent(hashName)
					};
				}
				multiBuyOrderBtn.style.display = null;
			}
			
			var response = await searchMarketGameItems(gameid, 2, cardborder);
			if (response.success && response.results.length == 0) {
				response = await searchMarketGameItems(gameid, 2, cardborder);
			}
			if (response.success && response.results.length > 0) {
				var res = cardsAddMarketInfoBtn(cardElems, response.results);
				if (!res) {
					var response2 = await searchMarketGameItems(gameid, 2, cardborder, "", "english");
					if (response2.success && response2.results.length > 0) {
						if (location.href.search(/\?/) > 0) {
							var url = location.href + "&l=english";
						} else {
							var url = location.href + "?l=english";
						}
						var cardElems2 = await getCardElements(url);
						if (cardElems2?.length) {
							res = cardsAddMarketInfoBtn(cardElems, response2.results, cardElems2);
						}
					}
				}

				if (res) {
					multiBuyOrderBtn.style.display = null;
				}
			}
			//显示市场价格信息
			if (globalSettings.gamecards_show_priceoverview) {
				getAllCardsPrice();
			}
		}

		function cardsAddMarketInfoBtn(cardElems, marketItems, cardElems2) {
			var res = 0;
			for (let i = 0; i < cardElems.length; i++) {
				let cardElem = cardElems[i];
				let image = (cardElems2?.[i] || cardElem).querySelector("img.gamecard").src;
				for (let card of marketItems) {
					if (image.includes(card.asset_description.icon_url)) {
						cardElem.asset = card.asset_description;
						let hashName = getMarketHashName(card.asset_description);
						let html = `<a class="market_link open_market_page" href="https://steamcommunity.com/market/listings/753/${hashName}" target="_blank">打开市场页面</a>
									<a class="market_link show_market_info" data-market-hash-name="${hashName}" style="margin-top: 5px;">起价：${card.sell_price_text}</a>`;

						cardElem.lastElementChild.innerHTML = html;
						cardElem.lastElementChild.onclick = showMarketPriceTable;
						
						res++;
						break;
					}
				}
			}
			return res == cardElems.length;
		}

		function showMultiCreateBuyOrder() {
			var cardElems = document.querySelectorAll("div.badge_card_set_card");
			var cardAssets = [];
			for (let elem of cardElems) {
				if (elem.asset) {
					cardAssets.push(elem.asset);
				}
			}
			dialogMultiCreateBuyOrder.show(cardAssets, currencyInfo, myBuyOrderTotalAmount, unsafeWindow.g_rgWalletInfo);
		}

		//添加显示该游戏的所有求购订单
		async function appendMyBuyOrders(doc) {
			var container = document.querySelector("#my_buy_order_container");
			if (!container) {
				container = document.createElement("div");
				container.id = "my_buy_order_container";
				container.innerHTML = `<style>.my_buy_order_table {border-spacing: 0 5px; width: 920px; margin: 10px; } .my_buy_order_table thead td:not(:last-child) {border-right: 1px solid #404040;}
										.my_buy_order_table tr {background-color: #00000033;} .my_buy_order_table td {padding: 0 5px; height: 30px; font-size: 12px;} 
										.my_buy_order_table thead td {text-align: center; white-space: nowrap; overflow: hidden; box-sizing: border-box; padding: 5px 5px;}
										.my_buy_order_name {display: flex; align-items: center; width: 410px;} .my_buy_order_name img {width: 38px; height: 38px; margin: 5px; border: 1px solid #3A3A3A; background-color: #333333;}
										.my_buy_order_item_name, my_buy_order_game_name {overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: inherit;} 
										.my_buy_order_cell {width: 105px; color: white; text-align: center; overflow: hidden; white-space: nowrap;} .my_buy_order_item_name:hover {text-decoration: underline;}
										.my_buy_order_action {text-align: center; position: relative;} .my_buy_order_cancel {display: inline-block; line-height: 30px; width: 60px;} 
										.my_buy_order_cancel:hover, #my_buy_order_cancel_all:hover, #my_buy_order_update:hover, .my_buy_order_price:hover {background: #7bb7e355;} 
										.my_buy_order_checkbox {position: absolute; top: 15px; right: 20px; cursor: pointer; transform: scale(1.5);}  
										#my_buy_order_action_all {position: relative;} #my_buy_order_cancel_all {display: inline-block; line-height: 30px; width: 80px;} .my_buy_order_price {line-height: 30px; cursor: pointer;}
										#my_buy_order_select_btn {position: absolute; top: 7.5px; right: 20px; line-height: 30px;} #my_buy_order_select_all {cursor: pointer; transform: scale(1.5) translateY(2px);} 
										#my_buy_order_select_btn label {cursor: pointer; color: white; padding-right: 4px;} .my_buy_order_item_name {font-size: 14px; font-weight: bold;}
										#my_buy_order_update {line-height: 24px; width: 60px; float: right; text-align: center; background: #00000066;} #my_buy_order_number {color: #BCBCBC; font-size: 12px;}</style>
										<div style="margin: 10px 10px 0 10px;"><span style="color: white; font-size: 15px;">我的订购单</span><span id="my_buy_order_number"></span><a id="my_buy_order_update">更新</a></div>
										<div id="my_buy_order_section"></div>`;

				document.querySelector(".badge_card_set_cards").parentNode.appendChild(container);
				container.querySelector("#my_buy_order_update").onclick = event => {
					appendMyBuyOrders();
				}
			}

			container.querySelector("#my_buy_order_number").textContent = "（0）";
			container.querySelector("#my_buy_order_section").innerHTML = "";

			var myOrders = await allMyBuyOrders.load(doc);
			if (myOrders && myOrders.length > 0) {
				var gameid = getGameId();
				var gameOrders = [];
				var totalBuy = 0;
				for (var order of myOrders) {
					if (order.appid == "753" && order.market_hash_name.startsWith(gameid + "-")) {
						gameOrders.push(order);
					}
					totalBuy += getPriceFromSymbolStr(order.price) * order.quantity;
				}
				myBuyOrderTotalAmount = totalBuy;
				container.querySelector("#my_buy_order_number").textContent = `（${myOrders.length} ▶ ${getSymbolStrFromPrice(totalBuy, currencyInfo)}）`;

				if (gameOrders.length > 0) {
					var totalQuantity = 0;
					var totalPrice = 0;
					var html = "";
					for (var order of gameOrders) {
						totalQuantity += parseInt(order.quantity);
						totalPrice += parseInt(order.quantity) * getPriceFromSymbolStr(order.price);
						html += `<tr class="my_buy_order_row" data-market-hash-name="${order.market_hash_name}" data-buy-orderid="${order.buy_orderid}">
								 <td><div class="my_buy_order_name"><img src="${order.icon}"><span><a class="my_buy_order_item_name" href="${order.market_link}" target="_blank">${order.name}</a><br>
								 <span class="my_buy_order_game_name">${order.game_name}</span></span></div></td>
								 <td><div class="my_buy_order_cell">${order.quantity}</div></td><td><div class="my_buy_order_cell my_buy_order_price" data-market-hash-name="${order.market_hash_name}">${order.price}</div></td>
								 <td class="my_buy_order_action"><a class="my_buy_order_cancel" data-name="${order.name}" data-buy-orderid="${order.buy_orderid}">取消</a><input type="checkbox" class="my_buy_order_checkbox"></td></tr>`;
					}

					totalPrice = getSymbolStrFromPrice(totalPrice, currencyInfo);
					html = `<table class="my_buy_order_table"><colgroup><col style="width: 0;"><col style="width: 0;"><col style="width: 0;"><col style="width: 100%;"></colgroup>
							<thead><tr><td style="position: relative;">名称</td><td style="max-width: 115px;" title="${totalQuantity}"><div>数量</div><div>(${totalQuantity})</div></td>
							<td style="max-width: 115px;" title="${totalPrice}"><div>价格</div><div>(${totalPrice})</div></td><td id="my_buy_order_action_all"><a id="my_buy_order_cancel_all">取消求购</a>
							<div id="my_buy_order_select_btn"><label for="my_buy_order_select_all">全选</label><input id="my_buy_order_select_all" type="checkbox"></div></td></tr></thead><tbody>${html}</tbody></table>`;

					container.querySelector("#my_buy_order_section").innerHTML = html;

					var rows = container.querySelectorAll(".my_buy_order_row");
					for (var row of rows) {
						row.querySelector(".my_buy_order_price").onclick = showMarketPriceInfo;
						row.querySelector(".my_buy_order_cancel").onclick = cancelBuyOrderClicked;
					}

					container.querySelector("#my_buy_order_select_all").onclick = event => {
						var checked = event.target.checked;
						for (var checkbox of container.querySelectorAll(".my_buy_order_row .my_buy_order_checkbox")) {
							checkbox.checked = checked;
						}
					}

					container.querySelector("#my_buy_order_cancel_all").onclick = event => {
						let toCancel = [];
						for (row of rows) {
							var button = row.querySelector(".my_buy_order_cancel");
							var checkbox = row.querySelector(".my_buy_order_checkbox");
							if (!button.getAttribute("data-cancelled") && checkbox.checked) {
								toCancel.push(button);
							}
						}

						unsafeWindow.ShowConfirmDialog("取消求购", "确定取消所有选中的求购？").done(function() {
							cancelAllSelected(toCancel);
						});
					}
				}
			}
		}

		async function getAllCardsPrice() {
			var elems = document.querySelectorAll(".show_market_info");
			var currencyInfo2 = getCurrencyInfo(globalSettings.second_currency_code);
			for (let el of elems) {
				var hashName = el.getAttribute("data-market-hash-name");
				var data = await getCurrentItemOrdersHistogram(currencyInfo.country, currencyInfo.eCurrencyCode, 753, hashName);
				showPirceUnderCard(hashName, data, currencyInfo);
				dialogPriceInfo.checkUpdateItemOrdersHistogram(753, hashName, data, currencyInfo, currencyInfo2);
			}
		}

		function showMarketPriceTable(event) {
			var elem = event.target;
			if (elem.classList.contains("show_market_info")) {
				var marketHashName = elem.getAttribute("data-market-hash-name");
				dialogPriceInfo.show(753, marketHashName, currencyInfo, function(data, currency) {
					showPirceUnderCard(marketHashName, data, currency);
				});
			}
		}

		function showPirceUnderCard(hashName, data1, currency) {
			if (data1 && currency.strCode == currencyInfo.strCode) {
				var elem2 = document.querySelector(`.show_market_info[data-market-hash-name="${hashName}"]`);
				if (elem2) {  //在卡牌下方显示最低出售价和最高求购价
					if (data1.success) {
						var html2 = data1.sell_order_graph.length > 0 ? getSymbolStrFromPrice(data1.sell_order_graph[0][0] * 100, currency) : "无";
						html2 += " | " + (data1.buy_order_graph.length > 0 ? getSymbolStrFromPrice(data1.buy_order_graph[0][0] * 100, currency) : "无");
					} else {
						var html2 = errorTranslator(data1);
					}
					elem2.innerHTML = html2;
					elem2.title = html2;
				}
			}
		}

		function showMarketPriceInfo(event) {
			dialogPriceInfo.show("753", event.target.getAttribute("data-market-hash-name"), currencyInfo);
		}

		function cancelBuyOrderClicked(event) {
			var button = event.target;
			unsafeWindow.ShowConfirmDialog("取消求购", `确定取消求购 ${button.getAttribute("data-name")} ？`).done(function() {
				cancelSelectedBuyOrder(button);
			});
		}

		async function cancelAllSelected(toCancel) {
			for (var btn of toCancel) {
				await cancelSelectedBuyOrder(btn);
			}
		}

		async function cancelSelectedBuyOrder(button) {
			var buyOrderId = button.getAttribute("data-buy-orderid");
			var buyOrder = allMyBuyOrders.getByOrderid(buyOrderId);

			if (buyOrder) {
				var res = await cancelBuyOrder(buyOrderId, unsafeWindow.g_sessionID);
			
				if (res.success == 1) {
					button.textContent = "已取消";
					button.style.color = "red";
					button.setAttribute("data-cancelled", "true");
					allMyBuyOrders.delete(buyOrder.appid, buyOrder.market_hash_name);
				}
			} else {
				button.textContent = "已取消";
				button.style.color = "red";
				button.setAttribute("data-cancelled", "true");
			}
		}

		function getGameId() {
			return location.href.match(/\/gamecards\/(\d+)/)[1];
		}

	}

	function ShowDialogBetter(title, desc, params) {
		var cmodel = unsafeWindow.ShowDialog(title, desc, params);

		setMaxHeight();
		window.addEventListener("resize", function() {
			setMaxHeight();
		});

		function setMaxHeight() {
			var maxHeight = document.compatMode === 'BackCompat' ? document.body.clientHeight : document.documentElement.clientHeight;
			cmodel.SetMaxHeight(maxHeight - 156);
		}

		cmodel.GetContent()[0].addEventListener("mousewheel", function(event) {
			if (event.target.tagName.toLowerCase() == "input" && event.target.type.toLowerCase() == "number") {
				event.preventDefault();
			}
		});

		return cmodel;
	}

	//市场价格信息的弹窗
	var dialogPriceInfo = {
		init: function(appid, marketHashName, currencyInfo) {
			var html = `<style>#dialog_price_info {font-size: 14px;} #market_info_group {display: flex; margin: 8px auto;} #market_info_group>div:first-child {margin-right: 20px;} #market_info_group>div {border: 1px solid #000000;} 
						#market_info_group .table_action_button, #market_info_group th, #market_info_group td {text-align: center; font-size: 14px;} .table_action_button {padding: 2px 0;}
						#market_info_group th, #market_info_group td {min-width: 100px; background: transparent; width: auto; line-height: normal;} 
						#market_info_price_overview>span {margin-right: 30px;} #market_info_group .market_commodity_orders_table {margin: 0px auto;} 
						#market_info_group .market_commodity_orders_table tr:nth-child(even) {background: #00000033;} #market_info_group .market_commodity_orders_table tr:nth-child(odd) {background: #00000066;}
						.orders_price_receive {font-size: 80%; color: #7f7f7f;} #market_info_price_overview {margin: 0 0 8px 0; text-wrap: nowrap; line-height: 22px;} .market_listings_table {min-width: 208px; min-height: 192px;}
						.inline_black_btn {font-family: "Motiva Sans", Sans-serif; font-weight: normal; display: inline-block; line-height: 22px; color: #ebebeb; padding: 0px 8px; background: #181818; font-size: 12px; user-select: none; position: relative; z-index: 9;} 
						.float_right_btn {float: right;} .table_action_button .inline_black_btn {padding: 0 20px;} .inline_black_btn:hover {background: #464646;} 
						.inline_black_btn[disabled="disabled"] {pointer-events: none; background: #4b4b4b66; box-shadow: none; color: #adadad;} #market_info_group .table_content {text-align: center;}
						.create_buy_order_container {margin: 0px;} .create_buy_order_inline {display: inline-block; line-height: 26px;} .create_buy_order_cell {position: relative;}
						#create_buy_order_price {width: 100px; color: #acb2b8;} #create_buy_order_quantity{width: 60px; color: #acb2b8;} #create_buy_order_total {width: 100px; text-wrap: nowrap; font-size: 13px;}
						#create_buy_order_second_price, #create_buy_order_second_total {position: absolute; font-size: 80%; color: #888888; width: 100px; text-wrap: nowrap;}
						#current_buy_order {margin: 0px; line-height: 22px;} #current_buy_order .order_info {margin: 0 20px;} .create_buy_order_inline .order_second_price {line-height: normal;}
						.market_info_dialog_separator {height: 1px; background: #1D1D1D; border-bottom: 1px solid #3B3B3B;} .header_btns {position: absolute; bottom: -22px; right: 32px;}</style>
						<div style="min-height: 230px;" id="dialog_price_info">
						<div id="market_info_price_overview">Loading...</div><div style="clear: both;"></div><div class="market_info_dialog_separator"></div>
						<div id="market_info_group">
						<div class="sell_order_table market_listings_table"><div class="table_action_button"><a id="market_buy_button" class="inline_black_btn">购买</a></div><div class="table_content">Loading...</div></div>
						<div class="buy_order_table market_listings_table"><div class="table_action_button"><a id="market_buy_order_button" class="inline_black_btn">求购</a></div><div class="table_content">Loading...</div></div></div>
						<div id="current_buy_order" style="display: none;"><div class="market_info_dialog_separator"></div>
						<div style="margin: 8px 0px;"><span>订购单：</span><span><数量></span><span id="order_quantity" class="order_info"></span><span><价格></span><span id="order_price" class="order_info"></span>
						<a id="cancel_current_buy_order" class="inline_black_btn float_right_btn">取消</a></div></div>
						<div class="create_buy_order_container" style="display: none;"><div class="market_info_dialog_separator"></div><div style="margin-top: 8px;">
						<div class="create_buy_order_inline">数量：</div>
						<div class="create_buy_order_inline"><input id="create_buy_order_quantity" type="number" step="1" min="1"></div>
						<div class="create_buy_order_inline" style="margin-left: 15px;">单价：</div>
						<div class="create_buy_order_inline create_buy_order_cell"><input id="create_buy_order_price" type="number" step="0.01" min="0.03"><div id="create_buy_order_second_price" class="order_second_price"></div></div>
						<div class="create_buy_order_inline" style="margin-left: 15px;">总价：</div>
						<div class="create_buy_order_inline create_buy_order_cell"><div id="create_buy_order_total">--</div><div id="create_buy_order_second_total" class="order_second_price"></div></div>
						<div class="create_buy_order_inline" style="float: right;"><a id="create_buy_order_purchase" class="inline_black_btn float_right_btn">提交订单</a></div>
						<div id="create_buy_order_message" style="margin-top: 15px; color: #FFFFFF;"></div></div></div></div>`;
			this.cmodel = ShowDialogBetter(decodeURIComponent(marketHashName), html);
			this.model = this.cmodel.GetContent()[0];

			this.appid = appid;
			this.marketHashName = marketHashName;
			this.walletCurrencyInfo = currencyInfo;
			this.secondCurrencyInfo = getCurrencyInfo(globalSettings.second_currency_code);
			this.currencyInfoShowing = currencyInfo;
			this.secondCurrencyInfoShowing = this.secondCurrencyInfo;
			this.histogram = null;
			this.sell_order_table = null;
			this.buy_order_table = null;

			var headerBtns = document.createElement("div");
			headerBtns.innerHTML = `<a id="second_currency_button" class="inline_black_btn" style="margin-right: 10px;">⇄ 第二货币</a><a id="update_button" class="inline_black_btn">更新</a>`;
			headerBtns.className = "header_btns";
			this.model.querySelector(".newmodal_header").style.position = "relative";
			this.model.querySelector(".newmodal_header").appendChild(headerBtns);

			this.model.querySelector("#second_currency_button").onclick = event => this.switchCurrency(event);
			this.model.querySelector("#market_buy_button").onclick = event => this.showCreateBuyOrder(event);
			this.model.querySelector("#market_buy_order_button").onclick = event => this.showCreateBuyOrder(event);

			this.model.querySelector("#create_buy_order_price").oninput = event => this.updatePriceTotal();
			this.model.querySelector("#create_buy_order_quantity").oninput = event => this.updatePriceTotal();

			this.model.querySelector("#create_buy_order_purchase").onclick = event => this.buyOrderPurchase(event);
			this.model.querySelector("#cancel_current_buy_order").onclick = event => this.confirmCancelBuyOrder(event);
		},
		show: function(appid, marketHashName, currencyInfo, histogramShowed, histogramReloaded, overviewReloaded, reload=false) {
			this.init(appid, marketHashName, currencyInfo);

			this.model.querySelector("#update_button").onclick = event => {
				this.showCurrentItemOrdersHistogram(appid, marketHashName, this.currencyInfoShowing, this.secondCurrencyInfoShowing, histogramShowed, histogramReloaded, true);
				this.showCurrentPriceOverview(appid, marketHashName, this.currencyInfoShowing, overviewReloaded, true);
			};

			this.showCurrentBuyOrder(appid, marketHashName);
			this.showCurrentItemOrdersHistogram(appid, marketHashName, currencyInfo, this.secondCurrencyInfo, histogramShowed, histogramReloaded, reload);
			this.showCurrentPriceOverview(appid, marketHashName, currencyInfo, overviewReloaded, reload);
		},
		switchCurrency: async function(event) {
			var btn = event.target;
			btn.setAttribute("disabled", "disabled");
			if (btn.getAttribute("data-second") == "true") {
				btn.setAttribute("data-second", "false");
				btn.textContent = "⇄ 第二货币";
				var currencyInfo = this.walletCurrencyInfo;
				var currencyInfo2 = this.secondCurrencyInfo;
			} else {
				btn.setAttribute("data-second", "true");
				btn.textContent = "⇄ 钱包货币";
				var currencyInfo = this.secondCurrencyInfo;
				var currencyInfo2 = this.walletCurrencyInfo;
			}
			
			this.showCurrentItemOrdersHistogram(this.appid, this.marketHashName, currencyInfo, currencyInfo2);
			this.showCurrentPriceOverview(this.appid, this.marketHashName, currencyInfo);
			btn.setAttribute("disabled", "");
		},
		showCurrentItemOrdersHistogram: async function(appid, hashName, currencyInfo, currencyInfo2, histogramShowed, histogramReloaded, reload=false) {
			this.currencyInfoShowing = currencyInfo;
			this.secondCurrencyInfoShowing = currencyInfo2;
			this.model.querySelector("#market_info_group .sell_order_table .table_content").innerHTML = "<br>Loading...";
			this.model.querySelector("#market_info_group .buy_order_table .table_content").innerHTML = "<br>Loading...";
			var data = await getCurrentItemOrdersHistogram(currencyInfo.country, currencyInfo.eCurrencyCode, appid, hashName, reload);

			this.checkUpdateItemOrdersHistogram(appid, hashName, data, currencyInfo, currencyInfo2);
			if (typeof histogramShowed === "function") {
				histogramShowed(data, currencyInfo);
			}
			if (reload && typeof histogramReloaded === "function") {
				histogramReloaded(data, currencyInfo);
			}
		},
		checkUpdateItemOrdersHistogram: function(appid, hashName, data, currencyInfo, currencyInfo2) {
			if (data && this.model && appid == this.appid && hashName == this.marketHashName) {
				if (data.success && currencyInfo.strCode == this.walletCurrencyInfo.strCode) {
					this.histogram = data;
				}

				var elem1 = this.model.querySelector("#market_info_group");
				if (elem1 && currencyInfo.strCode == this.currencyInfoShowing.strCode) {  
					var reverseRate = false;
					var walletCode = currencyInfo.strCode;
					if (currencyInfo.strCode == globalSettings.second_currency_code && currencyInfo2.strCode == this.walletCurrencyInfo.strCode) {
						reverseRate = true;
						walletCode = currencyInfo2.strCode;
					}

					//在弹出窗口上显示表格
					if (data.success) {
						elem1.querySelector(".sell_order_table .table_content").innerHTML = data.sell_order_table || data.sell_order_summary;
						elem1.querySelector(".buy_order_table .table_content").innerHTML = data.buy_order_table || data.buy_order_summary;
					} else {
						elem1.querySelector(".sell_order_table .table_content").innerHTML = `<br>${errorTranslator(data)}`
						elem1.querySelector(".buy_order_table .table_content").innerHTML = `<br>${errorTranslator(data)}`
					}

					//计算并显示第二价格
					var showSecondPrice = checkCurrencyRateUpdated(walletCode);
					if (data.sell_order_table) {
						var rows = elem1.querySelectorAll(".sell_order_table tr");
						if (showSecondPrice) {
							var th = document.createElement("th");
							th.textContent = rows[0].firstElementChild.textContent + " 2";
							rows[0].insertBefore(th, rows[0].lastElementChild);
						}

						for (var i = 1; i < rows.length; i++) {
							var text = rows[i].firstElementChild.textContent;
							var pay = getPriceFromSymbolStr(text);
							var price = calculatePriceYouReceive(pay);
							var [pay2, price2] = calculateSecondSellPrice(price, null, reverseRate);
							rows[i].firstElementChild.innerHTML = `<div class="orders_price_pay">${text}</div><div class="orders_price_receive">(${getSymbolStrFromPrice(price, currencyInfo)})</div>`;

							if (showSecondPrice) {
								var td = document.createElement("td");
								rows[i].insertBefore(td, rows[i].lastElementChild);
								td.innerHTML = `<div class="orders_price_pay">${getSymbolStrFromPrice(pay2, currencyInfo2)}</div><div class="orders_price_receive">(${getSymbolStrFromPrice(price2, currencyInfo2)})</div>`;
							}
						}
					}
					if (data.buy_order_table) {
						var rows = elem1.querySelectorAll(".buy_order_table tr");
						if(showSecondPrice) {
							var th = document.createElement("th");
							th.textContent = rows[0].firstElementChild.textContent + " 2";
							rows[0].insertBefore(th, rows[0].lastElementChild);
						}

						for (var i = 1; i < rows.length; i++) {
							var text = rows[i].firstElementChild.textContent;
							var pay = getPriceFromSymbolStr(text);
							var price = calculatePriceYouReceive(pay);
							var [pay2, price2] = calculateSecondBuyPrice(price, null, reverseRate);
							rows[i].firstElementChild.innerHTML = `<div class="orders_price_pay">${text}</div><div class="orders_price_receive">(${getSymbolStrFromPrice(price, currencyInfo)})</div>`;

							if (showSecondPrice) {
								var td = document.createElement("td");
								rows[i].insertBefore(td, rows[i].lastElementChild);
								td.innerHTML = `<div class="orders_price_pay">${getSymbolStrFromPrice(pay2, currencyInfo2)}</div><div class="orders_price_receive">(${getSymbolStrFromPrice(price2, currencyInfo2)})</div>`;
							}
						}
					}
				}
				this.cmodel.AdjustSizing();
			}
		},
		showCurrentPriceOverview: async function(appid, hashName, currencyInfo, overviewReloaded, reload=false) {
			this.model.querySelector("#market_info_price_overview").innerHTML = "Loading...";
			var data = await getCurrentPriceOverview(currencyInfo.country, currencyInfo.eCurrencyCode, appid, hashName, reload);

			this.checkUpdatePriceOverview(appid, hashName, data);
			if (reload && typeof overviewReloaded === "function") {
				overviewReloaded(data, currencyInfo);
			}
		},
		checkUpdatePriceOverview: function(appid, hashName, data) {
			if (data && this.model && appid == this.appid && hashName == this.marketHashName) { 
				var elem = this.model.querySelector("#market_info_price_overview");
				if (elem) {
					if (data.success) {
						var html2 = "";
						html2 += data.lowest_price ? `<span>最低售价：${data.lowest_price}</span>` : "";
						html2 += data.volume ? `<span>24小时销量：${data.volume} 个</span>` : "";
						html2 += data.median_price ? `<span style="margin-right: 0;">售价中位数：${data.median_price}</span>` : "";
					} else {
						var html2 = `<span>${errorTranslator(data)}</span>`;
					}
					elem.innerHTML = html2;	
				}
				this.cmodel.AdjustSizing();
			}
		},
		showCurrentBuyOrder: function(appid, hashName) {
			var buyOrder = allMyBuyOrders.get(appid, hashName);
			if (buyOrder) {
				var myBuyOrder = this.model.querySelector("#current_buy_order");
				myBuyOrder.style.display = null;
				myBuyOrder.querySelector("#order_quantity").innerHTML = buyOrder.quantity + " 个";
				myBuyOrder.querySelector("#order_price").innerHTML = buyOrder.price;

				var button = myBuyOrder.querySelector("#cancel_current_buy_order");
				button.setAttribute("data-buy-orderid", buyOrder.buy_orderid);
				button.textContent = "取消";
				button.style.color = null;
				this.cmodel.AdjustSizing();
			}
		},
		confirmCancelBuyOrder: function(event) {
			unsafeWindow.ShowConfirmDialog("取消求购", `确定取消求购 ${decodeURIComponent(this.marketHashName)} ？`).done(res => {
				this.cancelCurrentBuyOrder(event);
			});
		},
		cancelCurrentBuyOrder: async function(event) {
			var button = event.target;
			var buyOrderId = button.getAttribute("data-buy-orderid");
			var order = allMyBuyOrders.getByOrderid(buyOrderId);

			if (order) {
				var res = await cancelBuyOrder(buyOrderId, unsafeWindow.g_sessionID);
				if (res.success == 1) {
					button.textContent = "已取消";
					button.style.color = "red";
					allMyBuyOrders.delete(order.appid, order.market_hash_name);
				}
			} else {
				button.textContent = "已取消";
				button.style.color = "red";
			}
			this.cmodel.AdjustSizing();
		},
		showCreateBuyOrder: function(event) {
			if (this.histogram) {
				var button = event.target;
				var price = null;
				if (button.id == "market_buy_button") {
					price = this.histogram.lowest_sell_order;
				} else if (button.id == "market_buy_order_button") {
					price = this.histogram.highest_buy_order;
				}
	
				if (price) {
					this.model.querySelector("#create_buy_order_price").value = (price / 100.0).toFixed(2);
					this.updatePriceTotal();
				}
			}

			this.model.querySelector(".create_buy_order_container").style.display = null;
			this.model.querySelector("#create_buy_order_message").textContent = "";
			this.cmodel.AdjustSizing();
		},
		updatePriceTotal: function() {
			var amount = this.calculatePriceTotal();
			if (amount.price_total > 0 && amount.quantity > 0) {
				this.model.querySelector("#create_buy_order_total").textContent = getSymbolStrFromPrice(amount.price_total, this.walletCurrencyInfo);
			} else {
				this.model.querySelector("#create_buy_order_total").textContent = "--";
			}

			var currencyInfo2 = getCurrencyInfo(globalCurrencyRate.second_code);
			var price2 = getSymbolStrFromPrice(amount.price_2, currencyInfo2);
			var total2 = getSymbolStrFromPrice(amount.price_total_2, currencyInfo2);
			
			this.model.querySelector("#create_buy_order_second_price").textContent = amount.price_2 > 0 ? price2 : "";
			this.model.querySelector("#create_buy_order_second_total").textContent = amount.price_total_2 > 0 ? total2 : "";
		},
		calculatePriceTotal: function() {
			var price = Math.round(Number(this.model.querySelector("#create_buy_order_price").value) * 100);
			var quantity = parseInt(this.model.querySelector("#create_buy_order_quantity").value);
			var price2 = 0;
			if (checkCurrencyRateUpdated(this.walletCurrencyInfo.strCode)) {
				var price2 = calculateSecondBuyPrice(calculatePriceYouReceive(price))[0];
			}
			return {price: price, quantity: quantity, price_total: price * quantity, price_2: price2, price_total_2: price2 * quantity};
		},
		buyOrderPurchase: async function(event) {
			event.target.setAttribute("disabled", "disabled");
			var amount = this.calculatePriceTotal();
			if (amount.price_total > 0 && amount.quantity > 0) {
				var result = await createBuyOrder(unsafeWindow.g_sessionID, this.walletCurrencyInfo.eCurrencyCode, this.appid, this.marketHashName, amount.price_total, amount.quantity);

				var elemMsg = this.model.querySelector("#create_buy_order_message");
				elemMsg.style.width = window.getComputedStyle(elemMsg.parentNode).width;
				if (result.success == "1") {
					allMyBuyOrders.add(this.appid, this.marketHashName, {appid: this.appid, market_hash_name: this.marketHashName, quantity: amount.quantity, price: getSymbolStrFromPrice(amount.price, this.walletCurrencyInfo), buy_orderid: result.buy_orderid});
					elemMsg.textContent = "您已成功提交订购单！";
					this.showCurrentBuyOrder(this.appid, this.marketHashName);
				} else if (result.message) {
					elemMsg.textContent = result.message;
				} else {
					elemMsg.textContent = "抱歉！我们无法从 Steam 服务器获得关于您订单的信息。请再次检查您的订单是否确已创建或填写。如没有，请稍后再试。";
				}
			}
			event.target.setAttribute("disabled", "");
			this.cmodel.AdjustSizing();
		}
	};

	//批量创建订购单的弹窗
	var dialogMultiCreateBuyOrder = {
		show: function(assets, currencyInfo, myBuyOrdersAmount, walletInfo) {
			this.assets = assets;
			this.walletCurrencyInfo = currencyInfo;
			this.myBuyOrdersAmount = myBuyOrdersAmount;
			this.walletInfo = walletInfo;

			if (!this.container) {
				var imgCopy = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAACiIAAAoiAa5ULiEAAAXYSURBVHhe7ZtNiBNnGMf/zyS6a6ugtILt2lop1YqlFFmotAfdgm6Skux2E1MQLO2htUQKHlTwtPYDxCqUelhatJ9ChZiY3ew2iXpYLwUPQg/1UGyLbbEiFVHsh9luMv8edtPOvJPdmUniJPvxgxze/zwz87x/3vd9JvMhaBDJ7LlHNZQSgIQAPAGgXY1pKMLdsXDwQ1V2i6iCW0hKevjsHlB/ByL3ttMGSOqapsWi4e6Mus0NdRkw0fnCx4C8rm7zBPKugC9Ee0IX1E1O0VTBDemhwp6mdR4ARBYRWvb06dzj6ian1DwCMpnCIyWNl8U47InfINzvK7cPv/RS123TDnWSyhZoVvglIK8AAInLvrLvub6+LTfNMfbUPAJKGhNq56Wkb4xFgica3flq3OfnGwS/AQARrCn7S0OfjY66XoNqNkBEQmaB+6PR0FWTdg8JhUJj2rjWR+JnABDI80v+GPuiv7/fVZ9cBZvhGmPLV24fNra9IBrt/l3TJAzgzqQUX79h4yElbFps14BTQ7mnAdkpIptAPAxBO4CFAHzGuFgkYHuselDXAOP50oP5F6nJUCUngeyKRroHjPFTMeUISCYvLUxlzxwV0b4VkQSA9RAsA7BI7XyzifYGvxbI3kqb4NFUNhc2R1WnqgEXL15coLVdHQT41lQxzSaZTC42tqOR7g9IHJ9s+kA5eWrwbKcxphpVO/fLtRsHIQiqeivhb1/8jKqt7ngwAeI8AEDkfhF9OJPJP6bGGbEYkMoWniRkt1nlFZLb/brWoRfvLHlgSdsC8/Z7D4kxY7sMiRvbANDZ2Tmulf+OAfwRACBYUdKQGxkZWabGVrAYQOJN8xznlbKfz27rCZ7s7d16LR6P/9nV1VUy7uMFIvjJ1Ia8lkyOrDBqANDX13cTkDDB25go1+vuln2ZXC7XpsaimgEi2GJsl8v6/pdDoRtGrRmQKCjSYq3d/1G1uh+LBL7XKHGSJUyYsOmvcfmUpKVSWXYmYbqulvGF6ombgq+sD5AcV+SepzZsPJHO5x9SdER7Aucg+G8qi8j29PCZ98xRVa4Dpqu3RpzGNZJUttAP4ICqu0HN0zICWplouPtdkl+pej3MKANERI9FAjt0XT8A4B91ey3MKAMwaUK8N/Q2NN86UI4AuKSWSDdY5q3Tue00rtnY5TnjRkCjmTdAFeYa8waowlxj3gBVmGtYardd3azgNK5CeqgQoHAAEMtf2NrgdaEkoj2Baf+s2eXp2QjQhZ8AsnrynmIDfrJ64pj14ZkBQmn4XaRGHNMzAwjuAnFL1WuGuEVwlyq7xTJv7eZMBadxRkjK5+fPV7015ZZXN28eExHleaEVuzwtSdvtUMFpXLOxy9OzKdCqzBugCnONOW+AZeGyWzQqOI2rkBo+GyL1ARCNuRIUXBfRErHw1py6yYhdnp6NAOr6cQFWiaCtIT9gFXW98jC0ZjwzAMLGP1JvwDE9M0AgCYKuX2KaCoI3BZJQdbd4ZkAsEkhviwSX68U7bY34bYsEl8cigbR6HrdYFi67RaOC07hmY5enZyOgVZk3QBXmGvMGqIJzWDS2MpnRpcZ2K2DNyZwz6jNALhtbZV/R0Xt5XmLNyZwz6jGApPkanHIwnc6tNGlNJJ3OrQTloFGz5FyPAX5dBkjDkBJ00K9dSGXzO6xDzzsymdGlqWx+B/3aBQg6KjrJol8Xy+uzlosXuwsHI6nB/F5o8r6qtyQ698V6g4dVueYRgIk3sY4APKbqrQePTeRqpS4DRITRcGAnIPtgnA6tAlkEZF80HNg51R3kugzApAmxSPdhXfxrAR4C8B2AZppRnMiBh3Txr41Fug9P1XlUXwPyd4H/P4XxlduWefEJjBsymdGlZd+Y4SELi7FIcJExxilVRsDsqO9OsRhgqZUztL47xWLAbKnvTrGsAZgl9d0pVQ1o+iexjuGx6UqcEyxTALOkvjul6ggw4vln8VNTBPADwJwO/0A8suVXNaAW/gX90aDfz4Tq1QAAAABJRU5ErkJggg==";
				var imgPaste = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAY0SURBVHhe7ZtbaBxVAIb/f6ZNtBbrhUKx3hCtPtRbFbUoaJQmmzVXm6x3NCIImlJR8AJqsb6oD16qPgjig9ZqJlu1m7BJa2t8UME7YoraSr2LWG+tbUyazPl9iLs7c2i32d3sZmjywcCe/z+7s+ffOefMmZwQReCl0pc4ch4UdDHJw22/ECT9S/A9h+aRq5ri79p+uaEtHIzuDX3XAniJ5CzbKwVJY8bwpqtbY+tsr5wUFIDXO7DAMcPbAc61vUlB2mNc/7REQ8OvtlUuHFvIh+uPtJet8QBAzoXvtNtyOTngFeB5nss5886nj8WSOQIOQLEVxGWZOpIE4Tm6NOF3Twz5ckDcQTL3PYR3RL0BA5DOXsLf6o/s+SiRSPihN08S+w0gmeq/TtIjJE+xPQvfDO+uLvbLeZ7nOocdOQLAtb0gEnZI5qFES/wV2yuVUBeQxO5U3xoAr0yg8RWDxCmO46xNpjaukbTfH61YQgEkezbdSXBFUIsWWpHs2XSnrZZCNoCudHo+YVaH7ehBmNVd6fR8Wy+W7OWU7OnvhPBM0JT0oUv3HkP8AgAw5h4Qt4ar6JtAuWBInhoai4QX4DiPA4DG/IV08CjIC4PvgbCirTn2bEgrklwAqf4uAIlMWcKI3LGTg3Py+p6N10h6NVMuB8bw2kRL3WuZstfbu4D+rO9IVOcqaW1bS/2N2XIJ5MYA4digQepH+4Zk9+9VbwLYFtQmmW17/6p6MygkGhp+JfVjUIPDo0PlEsgFwPCUKEHBMgB0dNQM+8a0Svje9kpFwve+Ma0dHTXD+/FC30UHmL6LIdgFtgC4PFOWtL29uX5RtmaAl9PpI+eMOrcY6BKUuBgiMEThvaHZ5sUb4/Hdto/x9cc2kqdlygLS7U2xK8O1iqOoACpNOQMoaC1wKDITgC1MN6ZkDHg91bfUAM0STgdZZfshBBC6FOQRAW2niI9C9WwEkBgiuRVAcnlj3aBdBZUOoKtn80Ka0Rcdstb2yowBsM4c7nYmli3bFTQq1gWSvb0nuWb0/SloPP5v5w0c8t/2vLfm2UbZkeTAd9eBPNH2KgmJJaz2Q+udinSB7g19zSRDt7gAIOg3CKFLclIh5hM8ylLN2Ojo2dcsbxwcr/I/5QwgmepbC/D6oCbwrrbG2qfJ4h6nTQRvcLCKO356nMDKoC5pdXtz/SpUrgtgcbisz9ub6p4sZ+MBILF48b5fZpl7Bf1tWedmXlQkAABzQiXy51C5jKyMx0cg7AxqJLJTaqUCiBi5xeQ0DSDHTAC2MN2YCcAWphszAdjCdKMit8ITeaYnicme/tsh1oH5/1i6X6R9ANa1N9d325Z9fgBvtzXFrkCUroBkT//tBJ8l0UggXvBBtgDo6k5tLGi5HZkAgNKfE5AkpDpbz0d0ApA+tqVicBzmf1RmEZkANHLCYyKeAPClpO1FHIMA7r+qobbL/ux8RGYQLCf2+SM5CE4VMwHYwnQjUmPAqlWrnDPOWbrwMKjgG6F/6e67rqV2fCeLhX3+SI4B69Pp4888b+lns1384Lv8ttCjyvF/Sm7o3+x5AwVt5IxMAGbUeQDAWbY+cUgQV6B65DbbyUdkAiBxjK0VAxne6nMwIhOAYJ4HsM/WC0LaReAlW85HZAJob4pvkbRE4EoY3V3oIagTrn92W1PsK/uz8xGpWaBc2OeP5CwwVcwEkH1l7cWjtW/wUCUXAPFH0JB4gtfbuyCoHYrkBsEN/Z1geLM0pA/k4D7CLemPmZLZRODkbDmKg6A/23QB2hOoBJAXUhyAzLZSjmDjo0Y2gKvj8Z2C81DYPvQJzQJtjbVPgVgT1MqCVNCCpRQkEYH9ABjvgqOZ16EASKqtMbbSB66XtCPoTSYkL1qf6lti6+UgmepvJXhcUCOY3fJ/wKnO8zyXVfPOJ3P/NlcsJM6B2BESpb0g3wDxZ0ifRGS0kGQTgNkhg4q1NdZvRL4AJhNvYGAu/xn+2v4lpgTpky8+jV3w8MPj+5NK+F0nTqKmZo8j3iwp2/emBGkXHefmTONRqQAAYHlz7C0jtAoK3XBVCgHfjVHL7D3DFekCQbrS6fnOKDtJtkBadNDN0sUiAeQQgK1G6MZI9fOJRE34PgfAf1jVOVvM8d92AAAAAElFTkSuQmCC";
				var imgClear = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAT7SURBVHhe7ZtdaFt1GMaf97RLCtMO56g3ikNQ1KmgRhDEi07n0mKatGsS6xe7K/Ry3bXFq124Kgq78EomQm2abE2rzSlDeyE4LxxDR/HOqUMQ5grtJm3a5DxebNnO/12TpenJunLO7yrv876cjx85STj5H4HHjIzQejZSiJJWEmRERHYDsPRcnTgkF0TknDic+DUeLXwo4uihzSA62AwT+cI+QL4QwUu65w38mcThZLxrXncaxTMBE9OFV8WRbyBo1z1PIZZo8c1krOsH3WoETwSMnbYfaW3BeQEe1L1mQPBKqSzPD/RGL+neRvFEwES+MCYib6m4DPAMiN8Aq6x6deK0QPAUIAcAtKjmWH9P9G2VbZhNC8jlZh5mq1yESGslI/mvBcYOxbt/MqcbI5efedmBTIvInpshWSpbO/amY6//bQxvkEY/nW9S3mEdcJ/8DYa8OnkAuLGtISMUaZVy6Q0ja4BNCxDgSXdNYmlPe9tpd+YFC//8NQliyZ2JZe67ETYvgNhp1MIrnZ2dJXfmBYODg2sQXnFnet+NsGkBGkKoM69oxoY9F7DdqPktMEJaL05Pt+ncTZGhj0UwWKlJ/BGW1X3mlDcUEZoXYG+lJvF5WFaPmFMm52KxlVo/n6sKyOZnX6HwK/cOtykXWca7yd7oj7qBagIymUzIams/D+Bp3dumzDsrSy+kUqlV3Vj3MyAUCoVBdOh820I8FAqFwjpGNQGJROIqwRM6364QPJFIJK7qHNUugQq5/Ox+CJ5x6IyK+WvvFMHvXfXWQ7wmIr03S7IEsYZRLs8ne7u/M4dvUVMAAMzMzIT/W7MWRXDrLUQc7Y9HR43BLSabt4chOF6pSRR37nB2dXd3F81Jk3UvAT8RCNCB3wgE6MBvBAJ04DeaKiA3bb+fnbLHs9P28NzcnL5tVpW5ubnWiSn7aHbKHs9OFd7TfS9pmoDM5Mw7JE4CSIE4fnmx+IGeqcbCteKIAB8BSAHy5US+MKBnvKJpAkTEuGEpgqi7roXj4KC7FhGj9pImCjDv48vt9/WrIkLzcqGqPaRpArYLgQAd+I1AgA78RiBAB34jEKADvxEI0IHfCATowG8EAnTgNwIBOvAbgQAd+I3mCSCM5SgU3rY8pRqEGH9pE+a2vKRpAsqQDEn36qwx1+uaiMOvK69JOmJh3JzwjqYJSMejttDqFOAYyUPJnq7P9Ew1+hNdn5I8JMAxR7i/P9Y1q2e8IlghogO/EQjQgaajo8MRobFOmUDT/qlpFFHHJCAvdXRUXSJb4Y4CIpHIGijmGjvB40Z9D0DwCaMWLA1GImvubD3uKADXN/aLuxYiPjk5eb8720quH4v0uDOBZRxzNeoTQHxrBII9JSs8CvCO3yLNh1KywqMQ3HqeCADEMY+5CnWdwLht725Z5e+A7DI7PGmVlof7+vqMJznuFuO2vbt1FaMEDhsNcrG8Io+l09EFI1+HugQAQHaycASWrPPdz2uAnKHDP68/KncXsNAikEcBHgDkPt0m5Eiy5+AnOl+PugVkMpkWtLXnLCCue/cSDpBPxg72SY2HJNzU9RkAAKlUqszlxQHHwSndu4c4xeXFgXpPHhsRAADpdHp5/vzZJIghAJd1fwu5DGLowrmzyXQ6vaybtaj7EtDMzs7uXFpBvwijJJ8D5AGRxre3EUhQBAsALpBisxjKpVKd1/RcPfwPinqunx0tX18AAAAASUVORK5CYII=";
				var html = "";
				for (var asset of assets) {
					html += `<tr class="multi_order_row" data-hash-name="${getMarketHashName(asset)}" data-appid="${asset.appid}">
							<td><div class="multi_order_name multi_order_cell"><img class="multi_order_item_img" src="${(asset.icon || "https://community.cloudflare.steamstatic.com/economy/image/" + asset.icon_url) + "/48fx48f"}">
							<a class="multi_order_name_link" href="https://steamcommunity.com/market/listings/${asset.appid}/${getMarketHashName(asset)}" target="_blank">${asset.market_name || asset.name}</a></div></td>
							<td><div class="multi_order_cell_actions"><a class="multi_order_action multi_order_copy" title="复制本行的数量和价格"><img src="${imgCopy}"></a>
							<a class="multi_order_action multi_order_paste" title="粘贴已复制的数量和价格到本行"><img src="${imgPaste}"></a>
							<a class="multi_order_action multi_order_clear" title="清空本行的数量和价格"><img src="${imgClear}"></a></div></td>
							<td><div class="multi_order_cell"><input class="multi_order_quantity" type="number" step="1" min="0"></div></td>
							<td><div class="multi_order_cell"><input class="multi_order_price" type="number" step="0.01" min="0.03"><div class="multi_order_second_price multi_order_second"></div></div></td>
							<td><div class="multi_order_cell"><div class="multi_order_total" data-price-total="0">--</div><div class="multi_order_second_total multi_order_second" data-price-total="0"></div></div></td>
							<td><div class="multi_order_status multi_order_cell"><span class="multi_order_message"></span></div></td></tr>`;
				}
				var modelHtml = `<style>.multi_order_table {border-spacing: 0 4px; margin-bottom: 10px; width: 895px;} .multi_order_cell {position: relative; width: 100%; display: inline-block; line-height: normal;}
								.multi_order_table td {padding: 0 5px; box-sizing: border-box; display: inline-block;} .multi_order_item_img {width: 48px; height: 48px; margin-right: 5px; cursor: pointer;}
								.multi_order_table thead td:not(:last-child) {border-right: 1px solid #404040;} .multi_order_table td:nth-child(1) {width: 430px;} .multi_order_table td:nth-child(2) {width: 88px;} 
								.multi_order_table td:nth-child(3) {width: 80px;} .multi_order_table td:nth-child(4) {width: 104px;} .multi_order_table td:nth-child(5) {width: 136px;} .multi_order_table td:nth-child(6) {width: 42px;}
								.multi_order_table tr {background-color: #00000033;} .multi_order_table thead td {height: 30px; line-height: 30px; text-align: center;} .multi_order_table tbody td {height: 58px; line-height: 58px;} 
								.multi_order_cell input {box-sizing: border-box; width: 100%; color: #acb2b8;} .multi_order_name {display: flex; align-items: center; margin: 5px 0px; overflow: hidden; text-wrap: nowrap;}
								#multi_order_actions {float: right;} #multi_order_purchase { margin-left: 10px; display: inline-block; background: #588a1b; box-shadow: 1px 1px 1px #00000099; border-radius: 2px; padding: 2px 10px; width: 80px; text-align: center; cursor: pointer; color: #FFFFFF;}
								#multi_order_purchase:hover, #multi_order_calc_btn:hover {background: #79b92b;} .multi_order_total {font-size: 13px; text-wrap: nowrap;} .multi_order_status {text-align: center;} .multi_order_name_link:hover {text-decoration: underline;}
								.multi_order_status span {cursor: default; position: relative; z-index: 9;} .multi_order_second {position: absolute; font-size: 12px; color: #888888; text-wrap: nowrap;}
								#multi_order_purchase[disabled="disabled"] {pointer-events: none; background: #4b4b4b; box-shadow: none; color: #bdbdbd;} .multi_order_name_link {overflow: hidden; text-overflow: ellipsis; font-weight: bold; color: inherit;}
								#multi_order_all_price {text-wrap: nowrap;} .multi_order_table tbody {display: inline-block; overflow-x: hidden; overflow-y: auto; min-height: 130px;}
								.multi_order_cell_actions {display: flex; height: 100%; width: 100%; align-items: center; justify-content: center;} 
								.multi_order_action {user-select: none; margin: 0 1px; line-height: 24px; height: 24px; width: 24px; text-align: center; border-radius: 3px;}
								.multi_order_action:hover {background: #FFFFFF18} .multi_order_action img {pointer-events: none; width: 16px; height: 16px; margin: 4px;}
								.multi_order_calc_container {float: right; margin: -20px 15px 0 0;} .multi_order_calc_container input {margin: 0 10px 0 5px; width: 80px;}
								#multi_order_calc_btn {background: #588a1b; box-shadow: 1px 1px 1px #00000099; border-radius: 2px; padding: 2px 10px; font-size: small; text-align: center; color: #FFFFFF;}</style>
								<div class="multi_order_calc_container">
								<span>总金额</span><input type="number" id="multi_order_calc_total" step="0.01" min="0.03" placeholder="Max">
								<span>单价</span><input type="number" id="multi_order_calc_price" step="0.01" min="0.03" placeholder="0.04"><a id="multi_order_calc_btn">计算</a></div>
								<div style="clear:both;"></div>
								<table class="multi_order_table">
								<thead style="display: inline-block;"><tr><td>物品名称</td><td><div class="multi_order_cell_actions"><a class="multi_order_action multi_order_pasteAll" title="粘贴已复制的数量和价格到全部物品"><img src="${imgPaste}"></a>
								<a class="multi_order_action multi_order_clearAll" title="清空全部物品的数量和价格"><img src="${imgClear}"></a></div></td>
								<td>数量</td><td>单价</td><td style="width: 178px;">金额</td></tr></thead>
								<tbody>${html}</tbody></table>
								<div style="width: 880px;"><div id="multi_order_actions"><input id="multi_order_auto_purchase" type="checkbox" style="vertical-align: middle; cursor: pointer;">
								<label for="multi_order_auto_purchase" style="font-size: small; cursor: pointer;">自动提交直至成功</label><div id="multi_order_purchase">提交订单</div></div>
								<div style="white-space: nowrap;"><span>订购单的总金额：</span><div class="multi_order_cell" style="width: auto;"><div id="multi_order_all_price">--</div>
								<div class="multi_order_all_price_second multi_order_second" style="font-size: 13px;"></div></div></div><div style="clear:both;"></div></div>`;
		
				this.container = document.createElement("div");
				this.container.style.fontSize = "14px";
				this.container.innerHTML = modelHtml;

				this.container.querySelector(".multi_order_pasteAll").onclick = event => this.pasteAllBuyOrderInput(event);
				this.container.querySelector(".multi_order_clearAll").onclick = event => this.clearAllBuyOrderInput(event);
	
				var tableRows = this.container.querySelectorAll(".multi_order_row");
				for (let row of tableRows) {
					row.oninput = event => this.updatePriceTotal(event);
					row.onclick = event => {
						if (event.target.classList.contains("multi_order_item_img")) {
							dialogPriceInfo.show(row.getAttribute("data-appid"), row.getAttribute("data-hash-name"), currencyInfo);
						} else if (event.target.classList.contains("multi_order_copy")) {
							this.copyBuyOrderInput(event.currentTarget);
						} else if (event.target.classList.contains("multi_order_paste")) {
							this.pasteBuyOrderInput(event.currentTarget);
						} else if (event.target.classList.contains("multi_order_clear")) {
							this.clearBuyOrderInput(event.currentTarget);
						}
					};
				}
	
				this.container.querySelector("#multi_order_purchase").onclick = event => this.multiOrderPurchase(event);
				this.container.querySelector("#multi_order_calc_btn").onclick = event => this.calcOrderQuantity(event);
			}

			this.cmodel = ShowDialogBetter("购买多种物品", this.container);
			this.cmodel.OnResize((maxWidth, maxHeight) => {
				this.container.querySelector("tbody").style.maxHeight = (maxHeight - 86) + "px";
			});
			this.showOrderStatus();
			this.cmodel.AdjustSizing();
		},
		calcOrderQuantity: function() {
			var cardNum = this.container.querySelectorAll("td .multi_order_name").length;
			var total = this.container.querySelector("#multi_order_calc_total").value;
			var price = this.container.querySelector("#multi_order_calc_price").value;
			var quantity = 0;

			if (!price) {
				price = this.container.querySelector("#multi_order_calc_price").getAttribute("placeholder");
			}
			price = Math.round(Number(price) * 100);

			if (price > 0) {
				if (!total) {
					if (typeof(this.myBuyOrdersAmount) == "number" && this.walletInfo?.wallet_balance > 0) {
						total = this.walletInfo.wallet_balance * 10 - this.myBuyOrdersAmount;
						quantity = Math.min(Math.floor(total / price / cardNum),  Math.floor(this.walletInfo.wallet_balance / price));
					}
				} else {
					total = Math.round(Number(total) * 100);
					if (total > 0) {
						quantity = Math.floor(total / price / cardNum);
					}
				}
			}

			if (quantity > 0) {
				this.copyQuantity = quantity;
				this.copyPrice = (price / 100).toFixed(2);
				this.pasteAllBuyOrderInput();
			}
		},
		showOrderStatus: function() {
			for(var elem of this.container.querySelectorAll(".multi_order_row")) {
				var appid = elem.getAttribute("data-appid");
				var hashName = elem.getAttribute("data-hash-name");
				var order = allMyBuyOrders.get(appid, hashName);
				if (order) {
					elem.querySelector(".multi_order_message").textContent = "❕";
					elem.querySelector(".multi_order_message").title = "您已对该物品提交有效的订购单。";
				} else {
					elem.querySelector(".multi_order_message").textContent = "";
					elem.querySelector(".multi_order_message").title = "";
				}
			}
		},
		multiOrderPurchase: async function(event) {
			var button = event.target;
			button.setAttribute("disabled", "disabled");
			button.textContent = "提交中...";
			var allSuccess = true;
			var sessionid = unsafeWindow.g_sessionID;
			var currency = this.walletCurrencyInfo.eCurrencyCode;
			for(var elem of this.container.querySelectorAll(".multi_order_row")) {
				var appid = elem.getAttribute("data-appid");
				var hashName = elem.getAttribute("data-hash-name");
				var amount = this.calculatePriceTotal(elem);
				if (amount.price_total > 0 && amount.quantity > 0) {
					if (allMyBuyOrders.get(appid, hashName)) {
						elem.querySelector(".multi_order_message").textContent = "⚠️";
						elem.querySelector(".multi_order_message").title = "您已对该物品提交有效的订购单。";
					} else {
						elem.querySelector(".multi_order_message").textContent = "•••";
						elem.querySelector(".multi_order_message").title = "";
						var result = await createBuyOrder(sessionid, currency, appid, hashName, amount.price_total, amount.quantity);
						if (result.success == "1") {
							allMyBuyOrders.add(appid, hashName, {appid: appid, market_hash_name: hashName, quantity: amount.quantity, price: getSymbolStrFromPrice(amount.price, this.walletCurrencyInfo), buy_orderid: result.buy_orderid});
							elem.querySelector(".multi_order_message").textContent = "✔️";
							elem.querySelector(".multi_order_message").title = "您已成功提交订购单！";
							this.clearBuyOrderInput(elem);
						} else if (result.message) {
							elem.querySelector(".multi_order_message").textContent = "⚠️";
							elem.querySelector(".multi_order_message").title = result.message;
						} else {
							elem.querySelector(".multi_order_message").textContent = "⚠️";
							elem.querySelector(".multi_order_message").title = "抱歉！我们无法从 Steam 服务器获得关于您订单的信息。请再次检查您的订单是否确已创建或填写。如没有，请稍后再试。";
						}

						if (result.success != "1") {
							allSuccess = false;
						}
		
					}
				}
			}
			button.setAttribute("disabled", "");
			button.textContent = "提交订单";

			if (!allSuccess && this.container.querySelector("#multi_order_auto_purchase").checked) {
				await sleep(500);
				this.multiOrderPurchase(event);
			}
		},
		updatePriceTotal: function(event) {
			var elem = event.currentTarget;
			var amount = this.calculatePriceTotal(elem);
			if (amount.price_total > 0 && amount.quantity > 0) {
				elem.querySelector(".multi_order_total").setAttribute("data-price-total", amount.price_total);
				elem.querySelector(".multi_order_total").textContent = getSymbolStrFromPrice(amount.price_total, this.walletCurrencyInfo);
			} else {
				elem.querySelector(".multi_order_total").setAttribute("data-price-total", 0);
				elem.querySelector(".multi_order_total").textContent = "--";
			}

			var currencyInfo2 = getCurrencyInfo(globalCurrencyRate.second_code);
			var price2 = getSymbolStrFromPrice(amount.price_2, currencyInfo2);
			var total2 = getSymbolStrFromPrice(amount.price_total_2, currencyInfo2);
			
			elem.querySelector(".multi_order_second_price").textContent = amount.price_2 > 0 ? price2 : "";
			elem.querySelector(".multi_order_second_total").textContent = amount.price_total_2 > 0 ? total2 : "";
			elem.querySelector(".multi_order_second_total").setAttribute("data-price-total", amount.price_total_2 > 0 ? amount.price_total_2 : 0);

			var allPriceTotal = 0;
			var allPriceTotal2 = 0;
			for (var totalElem of this.container.querySelectorAll(".multi_order_total")) {
				allPriceTotal += parseInt(totalElem.getAttribute("data-price-total"));
			}
			for (var totalElem of this.container.querySelectorAll(".multi_order_second_total")) {
				allPriceTotal2 += parseInt(totalElem.getAttribute("data-price-total"));
			}

			this.container.querySelector("#multi_order_all_price").textContent = getSymbolStrFromPrice(allPriceTotal, this.walletCurrencyInfo);
			this.container.querySelector(".multi_order_all_price_second").textContent = allPriceTotal2 > 0 ? getSymbolStrFromPrice(allPriceTotal2, currencyInfo2) : "";
		},
		calculatePriceTotal: function(elem) {
			var price = Math.round(Number(elem.querySelector(".multi_order_price").value) * 100);
			var quantity = parseInt(elem.querySelector(".multi_order_quantity").value);
			var price2 = 0;
			if (checkCurrencyRateUpdated(this.walletCurrencyInfo.strCode)) {
				var price2 = calculateSecondBuyPrice(calculatePriceYouReceive(price))[0];
			} 
			
			return {price: price, quantity: quantity, price_total: price * quantity, price_2: price2, price_total_2: price2 * quantity};
		},
		copyBuyOrderInput: function(row) {
			this.copyQuantity = row.querySelector(".multi_order_quantity").value;
			this.copyPrice = row.querySelector(".multi_order_price").value;
		},
		pasteBuyOrderInput: function(row) {
			if (this.copyQuantity) {
				row.querySelector(".multi_order_quantity").value = this.copyQuantity;
			}
			if (this.copyPrice) {
				row.querySelector(".multi_order_price").value = this.copyPrice;
			}
			row.dispatchEvent(new Event("input"));
		},
		clearBuyOrderInput: function(row) {
			row.querySelector(".multi_order_quantity").value = "";
			row.querySelector(".multi_order_price").value = "";
			row.dispatchEvent(new Event("input"));
		},
		pasteAllBuyOrderInput: function(event) {
			var tableRows = this.container.querySelectorAll(".multi_order_row");
			for (let row of tableRows) {
				this.pasteBuyOrderInput(row);
			}
		},
		clearAllBuyOrderInput: function(event) {
			var tableRows = this.container.querySelectorAll(".multi_order_row");
			for (let row of tableRows) {
				this.clearBuyOrderInput(row);
			}
		}
	}

	//添加商店页面设置
	function addStoreSettings() {
		var settingBtn = document.createElement("div");
		settingBtn.setAttribute("style", "position: absolute; background-color: #3b4b5f; right: 10px; top: 10px; border-radius: 2px; box-shadow: 0px 0px 2px 0px #00000099");
		settingBtn.innerHTML = "<a style='cursor: pointer; padding: 3px 15px; line-height: 24px; font-size: 12px; color: #b8b6b4;'>设置</a>";
		document.body.appendChild(settingBtn);

		settingBtn.onclick = function() {
			var settings = getStoreSettings();
			unsafeWindow.sfu_settings = settings;
			var selectOptions = "";
			for (var code in currencyData) {
				selectOptions += `<option value="${code}" ${code == settings.history_currency_code ? "selected='selected'": ""}>${code} ( ${currencyData[code].strSymbol} )</option>`;
			}
			var options = (`<style>.sfu_settings_container {user-select: none; width: 500px; font-size: 14px;} .settings_page_title {margin-bottom: 5px;} .settings_row {margin-left: 15px; margin-bottom: 10px;} .settings_row input[type="checkbox"], .settings_row label, .settings_select {cursor: pointer;}
							.margin_right_20 {margin-right: 20px;} .settings_option {display: inline-block; margin-bottom: 5px;} .settings_row input[type="checkbox"] {margin: 0 2px; vertical-align: middle;} .settings_select {color: #EBEBEB; background: #1F1F1F;} </style>
							<div class="sfu_settings_container">
							<div class="settings_page_title">商店搜索页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_search_click_picture" type="checkbox" onclick="window.sfu_settings.search_click_picture = this.checked;" ${settings.search_click_picture ? "checked=true" : ""}><label for="sfu_search_click_picture" class="margin_right_20">点击游戏图片打开徽章页面</label></div>
							<div class="settings_option"><input id="sfu_search_click_title" type="checkbox" onclick="window.sfu_settings.search_click_title = this.checked;" ${settings.search_click_title ? "checked=true" : ""}><label for="sfu_search_click_title" class="margin_right_20">点击游戏名时选中并复制</label></div>
							<div class="settings_option"><input id="sfu_search_click_price" type="checkbox" onclick="window.sfu_settings.search_click_price = this.checked;" ${settings.search_click_price ? "checked=true" : ""}><label for="sfu_search_click_price" class="margin_right_20">点击游戏价格时添加到购物车</label></div>
							<div class="settings_option"><input id="sfu_search_set_filter" type="checkbox" onclick="window.sfu_settings.search_set_filter = this.checked;" ${settings.search_set_filter ? "checked=true" : ""}><label for="sfu_search_set_filter">价格由低到高显示有卡牌的游戏</label></div>
							</div>
							<div class="settings_page_title">愿望单页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_wishlist_click_picture" type="checkbox" onclick="window.sfu_settings.wishlist_click_picture = this.checked;" ${settings.wishlist_click_picture ? "checked=true" : ""}><label for="sfu_wishlist_click_picture" class="margin_right_20">点击游戏图片打开徽章页面</label></div>
							<div class="settings_option"><input id="sfu_wishlist_click_title" type="checkbox" onclick="window.sfu_settings.wishlist_click_title = this.checked;" ${settings.wishlist_click_title ? "checked=true" : ""}><label for="sfu_wishlist_click_title" class="margin_right_20">点击游戏名时选中并复制</label></div>
							<div class="settings_option"><input id="sfu_wishlist_click_price" type="checkbox" onclick="window.sfu_settings.wishlist_click_price = this.checked;" ${settings.wishlist_click_price ? "checked=true" : ""}><label for="sfu_wishlist_click_price">点击游戏价格时打开商店页面</label></div>
							</div>
							<div class="settings_page_title">消费历史记录页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_history_append_filter" type="checkbox" onclick="window.sfu_settings.history_append_filter = this.checked;" ${settings.history_append_filter ? "checked=true" : ""}><label for="sfu_history_append_filter" class="margin_right_20">添加筛选栏和统计栏</label></div>
							<div class="settings_option"><input id="sfu_history_change_onclick" type="checkbox" onclick="window.sfu_settings.history_change_onclick = this.checked;" ${settings.history_change_onclick ? "checked=true" : ""}><label for="sfu_history_change_onclick">修改日期和物品的点击效果</label></div>
							<div class="settings_option"><span>货币：</span><select class="settings_select"; onchange="window.sfu_settings.history_currency_code = this.value;" title>${selectOptions}</select></div>
							</div>
							</div>`);
			unsafeWindow.ShowConfirmDialog("Steam功能和界面优化", options).done(function() {
				settings = unsafeWindow.sfu_settings;
				setStorageValue("SFU_STORE_SETTINGS", settings);
				window.location.reload();
			});
		};
	}

	function getStoreSettings() {
		var data = getStorageValue("SFU_STORE_SETTINGS") || {};
		data.search_click_picture ??= true;
		data.search_click_title ??= true;
		data.search_click_price ??= true;
		data.search_set_filter ??= true;
		data.wishlist_click_picture ??= true;
		data.wishlist_click_title ??= true;
		data.wishlist_click_price ??= true;
		data.history_append_filter ??= true;
		data.history_change_onclick ??= true;
		data.history_currency_code ??= "CNY";
		return data;
	}

	//添加社区页面设置
	function addSteamCommunitySetting() {
		var settingBtn = document.createElement("div");
		settingBtn.setAttribute("style", "position: absolute; background-color: #3b4b5f; right: 10px; top: 10px; border-radius: 2px; box-shadow: 0px 0px 2px 0px #00000099");
		settingBtn.innerHTML = "<a style='cursor: pointer; padding: 3px 15px; line-height: 24px; font-size: 12px; color: #b8b6b4;'>设置</a>";
		settingBtn.onclick = function() {
			var walletCurrencyCode = getCurrencyCode(unsafeWindow.g_rgWalletInfo.wallet_currency);
			var settings = getSteamCommunitySettings();
			var exchangeRate = readCurrencyRate();
			unsafeWindow.sfu_settings = settings;
			unsafeWindow.sfu_update_currency_rate = function() {
				getCurrencyRate(walletCurrencyCode, settings.second_currency_code, settings.rate_item_url, settings.rate_item_listingid);
			};
			
			var selectOptions = "";
			var selectOptions2 = "";
			for (var code in currencyData) {
				selectOptions += `<option value="${code}" ${code == walletCurrencyCode ? "selected='selected'": ""}>${code} ( ${currencyData[code].strSymbol} )</option>`;
				selectOptions2 += `<option value="${code}" ${code == settings.second_currency_code ? "selected='selected'": ""}>${code} ( ${currencyData[code].strSymbol} )</option>`;
			}
			var options = (`<style>.sfu_settings_container {user-select: none; width: 540px; font-size: 14px;} .settings_page_title {margin-bottom: 5px;} .settings_row {margin-left: 15px; margin-bottom: 10px;} 
							.settings_select, .settings_row input[type="checkbox"], .settings_row label, input[type="button"] {cursor: pointer;} .settings_select {color: #EBEBEB; background: #1F1F1F;} 
							.settings_row input[type="checkbox"] {vertical-align: middle; margin: 0 2px;} .settings_input_number {color: #EBEBEB; background: #1F1F1F; width: 60px; margin-left: 5px;} 
							.margin_right_20 {margin-right: 20px;} .settings_option {display: inline-block; margin-bottom: 5px;}  .currency_rate {margin-left: 15px; font-size: 13px;}
							.settings_input_number::-webkit-outer-spin-button, .settings_input_number::-webkit-inner-spin-button {-webkit-appearance: none !important;}
							.settings_currency {display: inline-block;} .settings_currency > div:first-child {margin-bottom: 5px;}</style>
							<div class="sfu_settings_container">
							<div style="margin-bottom: 5px; display: flex; align-items: center;"><span>汇率更新间隔(min): </span>
							<input class="settings_input_number" style="color: #EBEBEB;" type="number" min="1" step="1" value="${settings.rate_update_interval}" oninput="window.sfu_settings.rate_update_interval = Math.max(parseInt(this.value), 60);">
							<input type="button" value="立即更新" style="margin-left: 5px; padding: 2px 7px; background: #555555;" class="btn_grey_steamui" onclick="window.sfu_update_currency_rate();">
							<span id="show_update_time" style="margin-left: 20px;">${new Date(exchangeRate.last_update).toLocaleString()}</span></div>
							<div style="margin-bottom: 5px;"><span>用于更新汇率的物品的url: <span><input type="text" style="color: #EBEBEB; width: 320px;" value="${settings.rate_item_url}" oninput="window.sfu_settings.rate_item_url = this.value;"></div>
							<div style="margin-bottom: 5px;"><span>用于更新汇率的物品的listingid: <span><input type="text" style="color: #EBEBEB; width: 170px;" value="${settings.rate_item_listingid}" oninput="window.sfu_settings.rate_item_listingid = this.value;"></div>
							<div style="margin-bottom: 10px; display: flex; position: relative;">
							<div class="settings_currency" style="margin-right: 40px;">
							<div><span>钱包货币：</span><select class="settings_select"; disabled="disabled">${selectOptions}</select></div>
							<div class="currency_rate">1 ${exchangeRate.correlation_code} = ${exchangeRate.wallet_rate > 0? exchangeRate.wallet_rate: "??"} ${exchangeRate.wallet_code}</div>
							<div class="currency_rate">1 ${exchangeRate.wallet_code} = ${exchangeRate.wallet_second_rate > 0? exchangeRate.wallet_second_rate: "??"} ${exchangeRate.second_code}</div></div>
							<div class="settings_currency">
							<div><span>第二货币：</span><select class="settings_select"; onchange="window.sfu_settings.second_currency_code = this.value;" title="">${selectOptions2}</select></div>
							<div class="currency_rate">1 ${exchangeRate.correlation_code} = ${exchangeRate.second_rate > 0? exchangeRate.second_rate: "??"} ${exchangeRate.second_code}</div>
							<div class="currency_rate">1 ${exchangeRate.second_code} = ${exchangeRate.wallet_second_rate > 0? (1.0 / exchangeRate.wallet_second_rate).toFixed(6): "??"} ${exchangeRate.wallet_code}</div></div>
							</div>
							<div class="settings_page_title">库存页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_inventory_set_style" type="checkbox" ${settings.inventory_set_style ? "checked=true" : ""} onclick="window.sfu_settings.inventory_set_style = this.checked;"><label for="sfu_inventory_set_style" class="margin_right_20">修改页面布局</label></div>
							<div class="settings_option"><input id="sfu_inventory_set_filter" type="checkbox" ${settings.inventory_set_filter ? "checked=true" : ""} onclick="window.sfu_settings.inventory_set_filter = this.checked;"><label for="sfu_inventory_set_filter" class="margin_right_20">只显示普通卡牌</label></div>
							<div class="settings_option"><input id="sfu_inventory_append_linkbtn" type="checkbox" ${settings.inventory_append_linkbtn ? "checked=true" : ""} onclick="window.sfu_settings.inventory_append_linkbtn = this.checked;"><label for="sfu_inventory_append_linkbtn" class="margin_right_20">添加链接按键</label></div>
							<div class="settings_option"><input id="sfu_inventory_sell_btn" type="checkbox" ${settings.inventory_sell_btn ? "checked=true" : ""} onclick="window.sfu_settings.inventory_sell_btn = this.checked;"><label for="sfu_inventory_sell_btn" class="margin_right_20">添加出售按键</label></div>
							<div class="settings_option"><input id="sfu_inventory_market_info" type="checkbox" ${settings.inventory_market_info ? "checked=true" : ""} onclick="window.sfu_settings.inventory_market_info = this.checked;"><label for="sfu_inventory_market_info" class="margin_right_20">自动显示市场价格信息</label></div>
							<div class="settings_option"><input id="sfu_inventory_stop_sell" type="checkbox" ${settings.inventory_stop_sell ? "checked=true" : ""} onclick="window.sfu_settings.inventory_stop_sell = this.checked;"><label for="sfu_inventory_stop_sell">需要确认时停止批量出售</label></div></br>
							<div class="settings_option"><span>一次批量出售的最大数量(0表示不限): </span><input class="settings_input_number" id="sfu_inventory_sell_number" style="color: #EBEBEB;" type="number" step="1" min="0" value="${settings.inventory_sell_number}" oninput="window.sfu_settings.inventory_sell_number = Math.max(parseInt(this.value), 0);"></div>
							</div>
							<div class="settings_page_title">市场页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_market_adjust_listings" type="checkbox" ${settings.market_adjust_listings ? "checked=true" : ""} onclick="window.sfu_settings.market_adjust_listings = this.checked;"><label for="sfu_market_adjust_listings" class="margin_right_20">调整出售、求购、确认和历史记录列表</label></div>
							<div class="settings_option"><input id="sfu_market_show_priceinfo" type="checkbox" ${settings.market_show_priceinfo ? "checked=true" : ""} onclick="window.sfu_settings.market_show_priceinfo = this.checked;"><label for="sfu_market_show_priceinfo" class="margin_right_20">出售物品表格自动显示最低出售和最高求购</label></div>
							<div class="settings_option"><span>出售物品表格每页物品数量: </span><input class="settings_input_number" id="sfu_market_page_size" style="color: #EBEBEB;" type="number" step="1" min="1" value="${settings.market_page_size}" oninput="window.sfu_settings.market_page_size = Math.max(parseInt(this.value), 10);"></div>
							</div>
							<div class="settings_page_title">市场物品页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_marketlisting_set_style" type="checkbox" ${settings.marketlisting_set_style ? "checked=true" : ""} onclick="window.sfu_settings.marketlisting_set_style = this.checked;"><label for="sfu_marketlisting_set_style" class="margin_right_20">修改页面布局</label></div>
							<div class="settings_option"><input id="sfu_marketlisting_show_priceoverview" type="checkbox" ${settings.marketlisting_show_priceoverview ? "checked=true" : ""} onclick="window.sfu_settings.marketlisting_show_priceoverview = this.checked;"><label for="sfu_marketlisting_show_priceoverview" class="margin_right_20">显示销售信息</label></div>
							<div class="settings_option"><input id="sfu_marketlisting_append_linkbtn" type="checkbox" ${settings.marketlisting_append_linkbtn ? "checked=true" : ""} onclick="window.sfu_settings.marketlisting_append_linkbtn = this.checked;"><label for="sfu_marketlisting_append_linkbtn">添加链接按键</label></div>
							</div>
							<div class="settings_page_title">徽章页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_gamecards_set_style" type="checkbox" ${settings.gamecards_set_style ? "checked=true" : ""} onclick="window.sfu_settings.gamecards_set_style = this.checked;"><label for="sfu_gamecards_set_style" class="margin_right_20">修改页面布局</label></div>
							<div class="settings_option"><input id="sfu_gamecards_append_linkbtn" type="checkbox" ${settings.gamecards_append_linkbtn ? "checked=true" : ""} onclick="window.sfu_settings.gamecards_append_linkbtn = this.checked;"><label for="sfu_gamecards_append_linkbtn" class="margin_right_20">添加链接按键</label></div>
							<div class="settings_option"><input id="sfu_gamecards_show_priceoverview" type="checkbox" ${settings.gamecards_show_priceoverview ? "checked=true" : ""} onclick="window.sfu_settings.gamecards_show_priceoverview = this.checked;"><label for="sfu_gamecards_show_priceoverview">自动显示市场价格信息</label></div>
							</div>
							</div>`);
			unsafeWindow.ShowConfirmDialog("Steam功能和界面优化", options).done(function() {
				setStorageValue("SFU_COMMUNITY_SETTINGS", unsafeWindow.sfu_settings);
				window.location.reload();
			});
		};
		document.body.appendChild(settingBtn);
	}

	function getSteamCommunitySettings() {
		var data = getStorageValue("SFU_COMMUNITY_SETTINGS") || {};
		data.second_currency_code ??= "USD";
		data.rate_update_interval ??= 360;
		data.rate_item_url ??= "https://steamcommunity.com/market/listings/570/Inscribed%20Bracers%20of%20Impending%20Transgressions";
		data.rate_item_listingid ??= "4884793372899146898";
		data.inventory_set_style ??= true;
		data.inventory_set_filter ??= true;
		data.inventory_append_linkbtn ??= true;
		data.inventory_sell_btn ??= true;
		data.inventory_market_info ??= true;
		data.inventory_stop_sell ??= false;
		data.inventory_sell_number ??= 0;
		data.marketlisting_set_style ??= true;
		data.marketlisting_show_priceoverview ??= true;
		data.marketlisting_append_linkbtn ??= true;
		data.gamecards_set_style ??= true;
		data.gamecards_show_priceoverview ??= false;
		data.gamecards_append_linkbtn ??= true;
		data.market_adjust_listings ??= true;
		data.market_show_priceinfo ??= false;
		data.market_page_size ??= 100;

		data.rate_update_interval = isNaN(data.rate_update_interval) ? 360 : data.rate_update_interval;
		data.inventory_sell_number = isNaN(data.inventory_sell_number) ? 0 : data.inventory_sell_number;
		data.market_page_size = isNaN(data.market_page_size) ? 100 : data.market_page_size;

		data.rate_update_interval = Math.max(data.rate_update_interval, 60);
		data.inventory_sell_number = Math.max(data.inventory_sell_number, 0);
		data.market_page_size = Math.max(data.market_page_size, 10);
		return data;
	}

	//检查是否更新汇率
	function checkUpdateCurrencyRate(settings, currencyRate) {
		if (unsafeWindow.g_rgWalletInfo?.wallet_currency) {
			var walletCurrencyCode = getCurrencyCode(unsafeWindow.g_rgWalletInfo.wallet_currency);
			if (walletCurrencyCode != currencyRate.wallet_code || settings.second_currency_code != currencyRate.second_code || 
				currencyRate.wallet_rate <= 0 || currencyRate.second_rate <= 0 || (Date.now() - currencyRate.last_update) > settings.rate_update_interval * 60000) {
				getCurrencyRate(walletCurrencyCode, settings.second_currency_code, settings.rate_item_url, settings.rate_item_listingid);
			}
		}
	}

	//获取并计算汇率
	async function getCurrencyRate(wallet_code, second_code, market_url, listingid) {
		var count = 100;
		var language = "english";
		var start = 0;
		var wallet_currency = getCurrencyInfo(wallet_code);
		var second_currency = getCurrencyInfo(second_code);
		await sleep(1000);
		var doc = getHtmlDocument(market_url + "/?l=english");
		await sleep(1000);
		var data = await getMarketListings(market_url, start, count, wallet_currency.country, language, wallet_currency.eCurrencyCode);
		if (data.success && data.total_count > 0) {
			var data1 = data;
			if (!data.listinginfo[listingid]) {
				for (var i = 0; i < parseInt(data.total_count / count); i++) {
					await sleep(1000);
					start = (parseInt(data.total_count / count) - i) * count;
					data1 = await getMarketListings(market_url, start, count, wallet_currency.country, language, wallet_currency.eCurrencyCode);
					if (data1.success) {
						if (data1.listinginfo[listingid]) {
							break;
						}
					} else {
						console.log("getCurrencyRate failed");
						return;
					}
				}
			}
			await sleep(1000);
			var data2 = await getMarketListings(market_url, start, count, second_currency.country, language, second_currency.eCurrencyCode);
			if (data2.success && data2.listinginfo[listingid]) {
				var rate = {
					wallet_code: wallet_code,
					second_code: second_code,
					correlation_code: getCurrencyCode(data1.listinginfo[listingid].currencyid % 2000),
					wallet_rate: (data1.listinginfo[listingid].converted_price / data1.listinginfo[listingid].price).toFixed(6),
					second_rate: (data2.listinginfo[listingid].converted_price / data2.listinginfo[listingid].price).toFixed(6),
					wallet_second_rate: (data2.listinginfo[listingid].converted_price / data1.listinginfo[listingid].converted_price).toFixed(6),
					last_update: Date.now()
				};
				globalCurrencyRate = rate;
				saveCurrencyRate(rate);
			}
		}
	}

	//获取本地的汇率数据
	function readCurrencyRate() {
		var data = getStorageValue("SFU_CURRENCY_RATE") || {};
		data.wallet_code ??= "???";
		data.second_code ??= "???";
		data.correlation_code ??= "???";
		data.wallet_rate ??= "-1";
		data.second_rate ??= "-1";
		data.wallet_second_rate ??= "-1";
		data.last_update ??= 0;
		return data;
	}

	//保存汇率数据在本地
	function saveCurrencyRate(data) {
		setStorageValue("SFU_CURRENCY_RATE", data);
	}

	//添加库存页面导航
	function appendPageControl() {
		var styleElem = document.createElement("style");
		styleElem.innerHTML = `#inventory_pagecontrols { display: none; }
							#SFU_pagecontrols { float: right; user-select: none; line-height: 22px; text-align: center; text-align: right;}
							.pagecontrol_pagelink { color: #ffffff; cursor: pointer; margin: 0 3px; }
							.pagecontrol_pagelink:hover { text-decoration: underline; }
							.pagecontrol_pagelink.active:hover { text-decoration: none; }
							.pagecontrol_pagelink.active { color: #747474; cursor: default; }
							.pageNumber { background: transparent; width: 25px; box-shadow: none; margin: 0 5px 0 5px; }`;
		document.body.appendChild(styleElem);

		var inventory_pagecontrols = document.querySelector('#inventory_pagecontrols');
		if (!inventory_pagecontrols) {
			return;
		}
		var pageControl = document.createElement('div');
		pageControl.id = 'SFU_pagecontrols';
		var html = `<span style="font-size: 13px;">跳到</span><input class="pageNumber" type="text" style="color: white;">
					<a class="pagebtn" href="javascript:InventoryPreviousPage();"> < </a>
					<span id="pagecontrol_links"></span>
					<a class="pagebtn" href="javascript:InventoryNextPage();"> > </a>`;
		pageControl.innerHTML = html;
		inventory_pagecontrols.parentNode.insertBefore(pageControl, inventory_pagecontrols);

		var pageLinks = pageControl.querySelector('#pagecontrol_links');
		pageLinks.onclick = function(event) {
			var elem = event.target;
			var g_ActiveInventory = unsafeWindow.g_ActiveInventory;
			if (elem.classList.contains("pagecontrol_pagelink")) {
				var iCurPage = g_ActiveInventory.m_iCurrentPage ?? g_ActiveInventory.pageCurrent;
				var iMaxPage = g_ActiveInventory.m_cPages ?? g_ActiveInventory.pageTotal;
				var iNextPage = parseInt(elem.getAttribute("data-page-num"));
				if (iNextPage == -1) {  //向前跳转5页
					iNextPage = Math.max(0, iCurPage - 5);
				} else if (iNextPage == -2) {  //向后跳转5页
					iNextPage = Math.min(iMaxPage - 1, iCurPage + 5);
				} else {
					iNextPage -= 1;
				}
				if (iNextPage != iCurPage) {
					changeInventoryPage(iNextPage);
				}
			}
		};

		var pageNumber = pageControl.querySelector('.pageNumber');
		pageNumber.onkeydown = function(event) {
			if (event.keyCode == 13) {  //按下回车键
				var text = event.target.value.trim();
				if (/^\d+$/.test(text)) {
					var g_ActiveInventory = unsafeWindow.g_ActiveInventory;
					var maxPage = g_ActiveInventory.m_cPages ?? g_ActiveInventory.pageTotal;
					var nextPage = parseInt(text);
					if (1 <= nextPage && nextPage <= maxPage) {
						changeInventoryPage(nextPage-1);
					}
				}
			}
		}
		
		var obs = new MutationObserver(function() {
			updatePageControl();
		});
		obs.observe(inventory_pagecontrols.querySelector('.pagecontrol_element.pagecounts'), { childList: true, subtree: true }); 

		updatePageControl();

		function updatePageControl() {
			var g_ActiveInventory = unsafeWindow.g_ActiveInventory;
			if (!g_ActiveInventory) {
				return;
			}

			document.querySelector('#inventory_pagecontrols').style.display = "none";
			var iCurPage = (g_ActiveInventory.m_iCurrentPage ?? g_ActiveInventory.pageCurrent) + 1;
			var iMaxPage = g_ActiveInventory.m_cPages ?? g_ActiveInventory.pageTotal;
			var html = `<span class="pagecontrol_pagelink" data-page-num="1"> 1 </span>`;
			var begin = 2;
			var end = iMaxPage - 1;

			if (iMaxPage > 9) {
				if (iCurPage <= 5) {
					end = 7;
				} else if (iCurPage >= iMaxPage - 4) {
					begin = iMaxPage - 6;
				} else {
					begin = iCurPage - 2;
					end = iCurPage + 2;
				}
			}

			if (begin > 3) {
				html += `<span class="pagecontrol_pagelink" data-page-num="-1"> ⋯ </span>`;
			}
			for (var i = begin; i <= end; i++) {
				html += `<span class="pagecontrol_pagelink" data-page-num="${i}"> ${i} </span>`;
			}
			if (end < iMaxPage - 2) {
				html += `<span class="pagecontrol_pagelink" data-page-num="-2"> ⋯ </span>`;
			}
			if (iMaxPage > 1) {
				html += `<span class="pagecontrol_pagelink" data-page-num="${iMaxPage}"> ${iMaxPage} </span>`;
			}
			
			pageLinks.innerHTML = html;
			pageLinks.querySelector(`.pagecontrol_pagelink[data-page-num="${iCurPage}"]`).classList.add("active");
			pageNumber.value = iCurPage;
		}
	}

	//跳转到指定库存页
	function changeInventoryPage(iNextPage) {
		var _this = unsafeWindow.g_ActiveInventory;
		if(location.href.search(/steamcommunity\.com\/(id|profiles)\/[^\/]+\/inventory/) >= 0) {
			if (_this.m_iCurrentPage != iNextPage && !_this.m_$Inventory.hasClass('paging_transition')) {
				var nPageWidth = _this.m_$Inventory.children('.inventory_page:first').width();
				var iCurPage = _this.m_iCurrentPage;
		
				_this.PrepPageTransition(nPageWidth, iCurPage, iNextPage);
		
				if (iCurPage < iNextPage) {
					_this.m_$Inventory.css('left', '0');
					_this.m_$Inventory.animate({left: -nPageWidth}, 250, null, function() {
						_this.FinishPageTransition(iCurPage, iNextPage);
					});
				} else {
					_this.m_$Inventory.css('left', '-' + nPageWidth + 'px');
					_this.m_$Inventory.animate({left: 0}, 250, null, function() {
						_this.FinishPageTransition(iCurPage, iNextPage);
					});
				}
		
			} else if (_this.m_$Inventory.hasClass('paging_transition' )) {
				_this.m_fnQueuedPageTransition = function() { changeInventoryPage(iNextPage); };
			}
		} else if (location.href.search(/steamcommunity\.com\/tradeoffer/) >= 0) {
			if (_this.pageCurrent != iNextPage && !_this.bInPagingTransition) {
				var nPageWidth = parseInt(window.getComputedStyle(_this.elInventory.firstElementChild).width.replace('px', ''));

				var iCurPage = _this.pageCurrent;

				_this.PrepPageTransition(nPageWidth, iCurPage, iNextPage);
				var fnOnFinish = _this.FinishPageTransition.bind(_this, iCurPage, iNextPage);

				if (iCurPage < iNextPage) {
					_this.elInventory.style.left = '0px';
					_this.transitionEffect = new Effect.Move(_this.elInventory, {x: -nPageWidth, duration: 0.25, afterFinish: fnOnFinish });
				} else {
					_this.elInventory.style.left = '-' + nPageWidth + 'px';
					_this.transitionEffect = new Effect.Move(_this.elInventory, {x: nPageWidth, duration: 0.25, afterFinish: fnOnFinish });
				}
			}
		}

	}

	var lastCheckbox = null;
	function checkboxShiftSelected(event, selector) {
		var checkbox = event.target;
		if (checkbox.checked && event.shiftKey) {
			if (!lastCheckbox) {
				lastCheckbox = checkbox;
			} else {
				var allCheckbox = Array.prototype.slice.call(document.querySelectorAll(selector));
				var flag = false;
				if (lastCheckbox != checkbox && allCheckbox.includes(lastCheckbox) && allCheckbox.includes(checkbox)) {
					for (var box of allCheckbox) {
						if (box == lastCheckbox || box == checkbox) {
							if (flag) {
								lastCheckbox.checked = true;
								break;
							} else {
								flag = true;
							}
						}
						if (flag) {
							box.checked = true;
						}
					}
					lastCheckbox = null;
				} else {
					lastCheckbox = checkbox;
				}
			}
		}
	}

	function appendCartForm(subid, sessionid, snr, orgsnr) {
		try {
			subid = typeof subid === "string" ? subid : subid.toString();
			var form = document.createElement("form");
			form.name = "add_to_cart_" + subid;
			form.setAttribute("action", "https://store.steampowered.com/cart/");
			form.setAttribute("method", "POST");
			form.style.display = "none";
			form.innerHTML = `<input type="hidden" name="snr" value="${snr}">
								<input type="hidden" name="originating_snr" value="${orgsnr}">
								<input type="hidden" name="action" value="add_to_cart">
								<input type="hidden" name="sessionid" value="${sessionid}">
								<input type="hidden" name="subid" value="${subid}">`;
			document.body.appendChild(form);
			return form;
		} catch (e) {
			console.log(e);
		}

	}

	//点击图片可打开徽章页面，点击物品名称下的游戏名可打开商店页面
	function addGameCardsLink(listing, asset) {
		var nameElem = listing.querySelector(".market_listing_item_name_link");
		nameElem.setAttribute("target", "_blank");
		var nameLink = nameElem.href;
		var appid = nameLink.match(/\/market\/listings\/(\d+)\//)[1];
		var gameNameElem = listing.querySelector(".market_listing_game_name");

		var cardLinkElem = document.createElement("a");
		cardLinkElem.setAttribute("target", "_blank");
		var itemImg = listing.querySelector(".market_listing_item_img");
		if (itemImg) {
			itemImg.parentNode.insertBefore(cardLinkElem, itemImg);
			cardLinkElem.appendChild(itemImg);
		}

		if (appid == "753") {
			var gameid = nameLink.match(/\/market\/listings\/\d+\/(\d+)-/)[1];
			var storeLink = "https://store.steampowered.com/app/" + gameid;
			var cardLink;
			if (asset) {
				cardLink = gameCardsLink(asset);
			} 
			if (!cardLink) {   //求购订单无法获取物品的asset
				var isFoil = nameLink.search(/(%28Foil%29|%28Foil%20Trading%20Card%29|\(Foil\)|\(Foil%20Trading%20Card\))/i) > 0;
				cardLink = `https://steamcommunity.com/my/gamecards/${gameid}/${isFoil? "?border=1" : ""}`;
			}
			
			gameNameElem.innerHTML = `<a class="market_listing_game_name_link" href="${storeLink}" target="_blank" title="打开商店页面">${gameNameElem.innerHTML}</a>`;
			
			cardLinkElem.href = cardLink;
			cardLinkElem.setAttribute("title", "打开徽章页面");
		} else {
			var storeLink = "https://store.steampowered.com/app/" + appid;
			gameNameElem.innerHTML = `<a class="market_listing_game_name_link" href="${storeLink}" target="_blank" title="打开商店页面">${gameNameElem.innerHTML}</a>`;
		
			cardLinkElem.href = "https://steamcommunity.com/market/search?appid=" + appid;
			cardLinkElem.setAttribute("title", "打开市场搜索结果");
		}
	}

	function getMarketHashName(assetInfo) {
		var marketHashName = assetInfo.market_hash_name || assetInfo.hash_name || assetInfo.market_name || assetInfo.name;
		return encodeURIComponent(marketHashName); 
	}

	function encodeMarketHashName(hashName) {
		//encodeURIComponent不会编码!()'等符号，导致从url中获取的MarketHashName与encodeURIComponent编码的不同
		//从url中获取的MarketHashName要先解码再编码才能保证相同
		return encodeURIComponent(decodeURIComponent(hashName));
	}

	function getPriceFromSymbolStr(str) {
		str = str.trim().replace('--', '00');
		str = str.replace(/(\D\.|\.\D)/g, '');
		if (str.indexOf('.') === -1 && str.indexOf(',') === -1) {
			str = str + ',00';
		}
		return parseInt(str.replace(/\D/g, ''));
	}

	function getSymbolStrFromPrice(price, currencyInfo) {
		price = (price / 100.0).toFixed(2);
		price = price.replace(".", currencyInfo.strDecimalSymbol);
		price = price.replace(/\B(?=(\d{3})+(?!\d))/g, currencyInfo.strThousandsSeparator)
		if (currencyInfo.bSymbolIsPrefix) {
			return currencyInfo.strSymbol + currencyInfo.strSymbolAndNumberSeparator + price;
		} else {
			return price + currencyInfo.strSymbolAndNumberSeparator + currencyInfo.strSymbol;
		}

	}

	function getAppid(elem, stopElem, className, attrName) {
		var el = elem;
		while(el != stopElem && el != document.body) {
			if(el.classList.contains(className)) {
				return el.getAttribute(attrName);
			}
			el = el.parentNode;
		}
		return null;
	}

	function getCardBorder(description) {
		if (description && description.appid == 753 && description.tags) {
			for (var tag of description.tags) {
				if (tag.category == "cardborder") {
					return tag.internal_name;
				}
			}
		}
		return null;
	}

	//闪卡name有(Foil)(Foil Trading Card)...
	function gameCardsLink(asset) {
		var link = asset?.owner_actions?.[0]?.link;
		if (typeof link === "string" && link.search(/steamcommunity\.com\/my\/gamecards\//) >= 0) {
			return link;
		}
		return null;
	}

	//由买家支付的金额计算卖家收到的金额
	function calculatePriceYouReceive(amount, item) {
		if (amount > 0 && amount == parseInt(amount)) {
			var publisherFee = item?.description?.market_fee ?? unsafeWindow.g_rgWalletInfo['wallet_publisher_fee_percent_default'];
			var feeInfo = unsafeWindow.CalculateFeeAmount(amount, publisherFee);
			return amount - feeInfo.fees;
		} else {
			return 0;
		}
	}

	//由卖家收到的金额计算买家支付的金额
	function calculatePriceBuyerPay(amount, item) {
		if (amount > 0 && amount == parseInt(amount)) {
			var publisherFee = item?.description?.market_fee ?? unsafeWindow.g_rgWalletInfo['wallet_publisher_fee_percent_default'];
			var info = unsafeWindow.CalculateAmountToSendForDesiredReceivedAmount(amount, publisherFee);
			return info.amount;
		} else {
			return 0;
		}
	}

	function checkCurrencyRateUpdated(walletCode) {
		return walletCode == globalCurrencyRate.wallet_code && walletCode != globalCurrencyRate.second_code && globalSettings.second_currency_code == globalCurrencyRate.second_code;
	}

	//根据汇率计算第二货币的价格
	function calculateSecondSellPrice(price, item, reverseRate=false) {
		if (price > 0) {
			price = reverseRate? (price / globalCurrencyRate.wallet_second_rate): (price * globalCurrencyRate.wallet_second_rate);
			var price2 = Math.max(Math.ceil(price), 1);
			var pay2 = calculatePriceBuyerPay(price2, item);
			return [pay2, price2];
		} else {
			return [0, 0];
		}
	}

	function calculateSecondBuyPrice(price, item, reverseRate=false) {
		if (price > 0) {
			price = reverseRate? (price / globalCurrencyRate.wallet_second_rate): (price * globalCurrencyRate.wallet_second_rate);
			var price2 = Math.floor(price);
			var pay2 = calculatePriceBuyerPay(price2, item);
			return [pay2, price2];
		} else {
			return [0, 0];
		}
	}

	var itemPriceGramInfo = {};
	async function getCurrentItemOrdersHistogram(country, currency, appid, hashName, reload=false) {
		var key = currency + "/" + appid + "/" + hashName;
		if (!reload && itemPriceGramInfo[key]) {
			if (itemPriceGramInfo[key].loaded) {
				return itemPriceGramInfo[key].data;
			} else {
				return null;  //正在加载中，避免重复获取
			}
		} else {
			itemPriceGramInfo[key] = {};
			var res = await getItemNameId(appid, hashName);
			if (res.success) {
				var itemNameId = res.nameid;
				var data1 = await getItemOrdersHistogram(country, currency, itemNameId);
				if (data1.success && (data1.buy_order_table || data1.buy_order_summary) && (data1.sell_order_table || data1.sell_order_summary)) {
					itemPriceGramInfo[key].data = data1;
					itemPriceGramInfo[key].loaded = true;
				} else {
					delete itemPriceGramInfo[key];
				}
				return data1;
			} else {
				delete itemPriceGramInfo[key];
				return res;
			}
		}
	}

	var itemPriceOverviewInfo = {};
	async function getCurrentPriceOverview(country, currency, appid, hashName, reload=false) {
		var key = currency + "/" + appid + "/" + hashName;
		if (!reload && itemPriceOverviewInfo[key]) {
			if (itemPriceOverviewInfo[key].loaded) {
				return itemPriceOverviewInfo[key].data;
			} else {
				return null;  //正在加载中，避免重复获取
			}
		} else {
			itemPriceOverviewInfo[key] = {};
			var data2 = await getPriceOverview(country, currency, appid, hashName);
			if (data2.success) {
				itemPriceOverviewInfo[key].data = data2;
				itemPriceOverviewInfo[key].loaded = true;
			} else {
				delete itemPriceOverviewInfo[key];
			}
			return data2;
		}
	}

	var allMyBuyOrders = {
		data: {},
		load: async function(doc) {
			doc ??= await getHtmlDocument("https://steamcommunity.com/market/");
			if (!doc) {
				return;
			}
	
			this.data = {};
			var myOrders = [];
			var buyOrderSection;
			for (var section of doc.querySelectorAll(".my_listing_section")) {
				if (section.querySelector(".market_listing_row")?.id?.match(/\bmybuyorder_\d+/)) {
					buyOrderSection = section;
					break;
				}
			}
	
			for (var row of (buyOrderSection ? buyOrderSection.querySelectorAll(".market_listing_row"): [])) {
				var icon = row.querySelector("img")?.src;  //可能没有图片
				var name = row.querySelector("a.market_listing_item_name_link").textContent.trim();
				var gameName = row.querySelector(".market_listing_game_name").textContent.trim();
				var marketLink = row.querySelector("a.market_listing_item_name_link").href;
				var appid = marketLink.match(/\/market\/listings\/(\d+)\//)[1];
				var hashName = encodeMarketHashName(marketLink.match(/\/market\/listings\/\d+\/([^\/\?\&\#\=]+)/)[1]);
				var quantity = row.querySelector(".market_listing_buyorder_qty .market_listing_price").textContent.trim();
				var qty = row.querySelector(".market_listing_inline_buyorder_qty").textContent.trim();
				var price = row.querySelector(".market_listing_my_price:not(.market_listing_buyorder_qty) .market_listing_price").textContent.replace(qty, "").trim();
				var orderid = row.id.match(/\bmybuyorder_(\d+)/)[1];
	
				var item = {icon: icon, name: name, game_name: gameName, market_link: marketLink, appid: appid, market_hash_name: hashName, quantity: quantity, price: price, buy_orderid: orderid};
				this.data[appid + "/" + hashName] = item;
				myOrders.push(item);
			} 
			return myOrders;
		},
		add: function(appid, hashName, item) {
			this.data[appid + "/" + hashName] = item;
		},
		get: function(appid, hashName) {
			return this.data[appid + "/" + hashName];
		},
		getByOrderid: function(orderid) {
			for (var key in this.data) {
				if (this.data[key].buy_orderid == orderid) {
					return this.data[key];
				}
			}
		},
		delete: function(appid, hashName) {
			delete this.data[appid + "/" + hashName];
		}
	};

	//出售物品
	function sellItem(sessionid, appid, contextid, assetid, amount, price) {
		return new Promise(function(resolve, reject) {
			var url = "https://steamcommunity.com/market/sellitem/";
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("POST", url, true);
			xhr.setRequestHeader("content-type", "application/x-www-form-urlencoded");
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(JSON.parse(e.target.response));
				} else {
					console.log("sellItem failed");
					resolve(e.target);
				}
			};
			xhr.onerror = function(error) {
				console.log("sellItem error");
				resolve(error);
			};
			xhr.ontimeout = function() {
				console.log("sellItem timeout");
				resolve({status: 408});
			};
			xhr.send(`sessionid=${sessionid}&appid=${appid}&contextid=${contextid}&assetid=${assetid}&amount=${amount}&price=${price}`);
		});
	}

	async function removeSelectedListings(listingsToRemove) {
		for (var listingElem of listingsToRemove) {
			var btn = listingElem.querySelector("a.item_market_action_button_edit");
			var listingid = getListid(listingElem);
			var data = await marketRemoveListing(listingid, unsafeWindow.g_sessionID);
			if (data.success) {
				listingElem.querySelector(".market_listing_check").setAttribute("data-removed", "true");
				btn.querySelector(".item_market_action_button_contents").textContent = "已下架";
				btn.style.color = "red";
			}
		}
	}

	function getListid(listing) {
		var args = listing.querySelector("a.item_market_action_button_edit").href.match(/RemoveMarketListing\(([^\(\)]+)\)/)[1].replace(/ /g, "").split(",");
		return eval(args[1]);
	}

	//取消待确认物品
	async function cancelSelectedConfirmation(rowsToCancel) {
		for (var row of rowsToCancel) {
			var btn = row.querySelector("a.item_market_action_button_edit");
			var cid = eval(btn.href.match(/\bCancelMarketListingConfirmation\(([^\(\)]+)\)/)[1].replace(/ /g, "").split(",")[1]);

			var data = await marketRemoveListing(cid, unsafeWindow.g_sessionID);
			if (data.success) {
				row.querySelector(".market_listing_check").setAttribute("data-removed", "true");
				btn.querySelector(".item_market_action_button_contents").textContent = "已取消";
				btn.style.color = "red";
			}
		}
	}

	//下架物品
	function marketRemoveListing(listingid, sessionid) {
		return new Promise(function(resolve, reject) {
			var url = "https://steamcommunity.com/market/removelisting/" + listingid;
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("POST", url, true);
			xhr.setRequestHeader("content-type", "application/x-www-form-urlencoded");
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve({success: true});
				} else {
					console.log("marketRemoveListing failed");
					resolve(e.target);
				}
			};
			xhr.onerror = function(error) {
				console.log("marketRemoveListing error");
				resolve(error);
			};
			xhr.ontimeout = function() {
				console.log("marketRemoveListing timeout");
				resolve({status: 408});
			};
			xhr.send(`sessionid=${sessionid}`);
		});
	}

	//获取市场上架的物品列表
	function getMarketMyListings(start, count) {
		return new Promise(function(resolve, reject) {
			var url = `https://steamcommunity.com/market/mylistings/render/?query=&start=${start}&count=${count}`;
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
			xhr.setRequestHeader("Cache-Control", "no-cache");
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(JSON.parse(e.target.response));
				} else {
					console.log("getMarketMyListings failed");
					resolve(e.target);
				}
			};
			xhr.onerror = function(error) {
				console.log("getMarketMyListings error");
				resolve(error);
			};
			xhr.ontimeout = function() {
				console.log("getMarketMyListings timeout");
				resolve({status: 408});
			};
			xhr.send();
		});
	}

	//获取市场历史记录
	function getMarketMyHistory(start=-1, count=10) {
		return new Promise(function(resolve, reject) {
			var url = `https://steamcommunity.com/market/myhistory`;
			if (start >= 0) {
				url += `/render/?query=&start=${start}&count=${count}`;
			}
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
			xhr.setRequestHeader("Cache-Control", "no-cache");
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(JSON.parse(e.target.response));
				} else {
					console.log("getMarketMyHistory failed");
					resolve(e.target);
				}
			};
			xhr.onerror = function(error) {
				console.log("getMarketMyHistory error");
				resolve(error);
			};
			xhr.ontimeout = function() {
				console.log("getMarketMyHistory timeout");
				resolve({status: 408});
			};
			xhr.send();
		});
	}

	//获取徽章页面的卡牌元素
	function getCardElements(url) {
		return new Promise(function(resolve, reject) {
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
			xhr.setRequestHeader("Cache-Control", "no-cache");
			xhr.responseType = "document";
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(e.target.response.querySelectorAll(".badge_card_set_card"));
				} else {
					console.log("getCardElements failed");
					resolve(null);
				}
			};
			xhr.onerror = function(error) {
				console.log("getCardElements error");
				resolve(null);
			};
			xhr.ontimeout = function() {
				console.log("getCardElements timeout");
				resolve(null);
			};
			xhr.send();
		});	
	}

	//获取账号钱包信息
	async function getWalletInfo(doc) {
		doc ??= await getHtmlDocument("https://steamcommunity.com/market/");
		if (doc) {
			for (var script of doc.querySelectorAll("script")) {
				var text = script.textContent;
				if (text.match(/\bg_rgWalletInfo\b/)) {
					try {
						return eval(text.match(/\b(var g_rgWalletInfo\b.+?\;)/)[1] + "g_rgWalletInfo;");
					} catch (err) { 
						console.log(err);
					}
				}
			}
		}
		return {
			wallet_balance: "0",
			wallet_country: "CN",
			wallet_currency: 23,
			wallet_delayed_balance: "0",
			wallet_fee: "1",
			wallet_fee_base: "0",
			wallet_fee_minimum: "1",
			wallet_fee_percent: "0.05",
			wallet_max_balance: "1300000",
			wallet_publisher_fee_percent_default: "0.10",
			wallet_state: "",
			wallet_trade_max_balance: "1170000"
		};
	}

	//获取网页
	function getHtmlDocument(url) {
		return new Promise(function(resolve, reject) {
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
			xhr.setRequestHeader("Cache-Control", "no-cache");
			xhr.responseType = "document";
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(e.target.response);
				} else {
					console.log("getHtmlDocument failed", `"${url}"`);
					resolve(null);
				}
			};
			xhr.onerror = function(error) {
				console.log("getHtmlDocument error", `"${url}"`);
				resolve(null);
			};
			xhr.ontimeout = function() {
				console.log("getHtmlDocument timeout", `"${url}"`);
				resolve(null);
			};
			xhr.send();
		});
	}

	//提交订购单
	function createBuyOrder(sessionid, currency, appid, market_hash_name, price_total, quantity, billing_state="", save_my_address=0) {
		return new Promise(function(resolve, reject) {
			var url = "https://steamcommunity.com/market/createbuyorder/";
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("POST", url, true);
			xhr.setRequestHeader("content-type", "application/x-www-form-urlencoded");
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(JSON.parse(e.target.response));
				} else {
					console.log("createBuyOrder failed");
					resolve(e.target);
				}
			};
			xhr.onerror = function(error) {
				console.log("createBuyOrder error");
				resolve(error);
			};
			xhr.ontimeout = function() {
				console.log("createBuyOrder timeout");
				resolve({status: 408});
			};
			xhr.send(`sessionid=${sessionid}&currency=${currency}&appid=${appid}&market_hash_name=${market_hash_name}&price_total=${price_total}&quantity=${quantity}&billing_state=${billing_state}&save_my_address=${save_my_address}`);
		});
	}

	function getBuyOrderStatus(sessionid, buyOrderId) {
		return new Promise(function(resolve, reject) {
			var url = `https://steamcommunity.com/market/getbuyorderstatus/?sessionid=${sessionid}&buy_orderid=${buyOrderId}`;
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
			xhr.setRequestHeader("Cache-Control", "no-cache");
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(JSON.parse(e.target.response));
				} else {
					console.log("getBuyOrderStatus failed");
					resolve(e.target);
				}
			};
			xhr.onerror = function(error) {
				console.log("getBuyOrderStatus error");
				resolve(error);
			};
			xhr.ontimeout = function() {
				console.log("getBuyOrderStatus timeout");
				resolve({status: 408});
			};
			xhr.send();
		});
	}

	//取消求购
	function cancelBuyOrder(buyOrderId, sessionid) {
		return new Promise(function(resolve, reject) {
			var url = "https://steamcommunity.com/market/cancelbuyorder/";
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("POST", url, true);
			xhr.setRequestHeader("content-type", "application/x-www-form-urlencoded");
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(JSON.parse(e.target.response));
				} else {
					console.log("cancelBuyOrder failed");
					resolve(e.target);
				}
			};
			xhr.onerror = function(error) {
				console.log("cancelBuyOrder error");
				resolve(error);
			};
			xhr.ontimeout = function() {
				console.log("cancelBuyOrder timeout");
				resolve({status: 408});
			};
			xhr.send(`sessionid=${sessionid}&buy_orderid=${buyOrderId}`);
		});
	}

	//获取销量信息
	function getPriceOverview(country, currencyId, appid, marketHashName) {
		return new Promise(function(resolve, reject) {
			var url = `https://steamcommunity.com/market/priceoverview/?country=${country}&currency=${currencyId}&appid=${appid}&market_hash_name=${marketHashName}`;
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
			xhr.setRequestHeader("Cache-Control", "no-cache");
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(JSON.parse(e.target.response));
				} else {
					console.log("getPriceOverview failed");
					resolve(e.target);
				}
			};
			xhr.onerror = function(error) {
				console.log("getPriceOverview error");
				resolve(error);
			};
			xhr.ontimeout = function() {
				console.log("getPriceOverview timeout");
				resolve({status: 408});
			};
			xhr.send();
		});
	}

	function getMarketListings(market_url, start, count, country, language, currency) {
		return new Promise(function(resolve, reject) {
			var url = `${market_url}/render/?query=&start=${start}&count=${count}&country=${country}&language=${language}&currency=${currency}`;
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
			xhr.setRequestHeader("Cache-Control", "no-cache");
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(JSON.parse(e.target.response));
				} else {
					console.log("getMarketListings failed");
					resolve(e.target);
				}
			};
			xhr.onerror = function(error) {
				console.log("getMarketListings error");
				resolve(error);
			};
			xhr.ontimeout = function() {
				console.log("getMarketListings timeout");
				resolve({status: 408});
			};
			xhr.send();
		});
	}

	var storageNameId = localforage.createInstance({name: "sfu_storage_itemnameid"});
	function getItemNameId(appid, marketHashName) {
		return new Promise(async function (resolve, reject) {
			try {
				var data = await storageNameId.getItem(appid + "/" + marketHashName);
			} catch (e) {
				console.log(e);
				var data = null;
			}

			if (data != null) {
				resolve({success: true, nameid: data});
			} else {
				var url = `https://steamcommunity.com/market/listings/${appid}/${marketHashName}`;
				var xhr = new XMLHttpRequest();
				xhr.timeout = TIMEOUT;
				xhr.open("GET", url, true);
				xhr.setRequestHeader("Cache-Control", "no-cache");
				xhr.onload = function(e) {
					if (e.target.status == 200) {
						var html = e.target.responseText;
						var res = html.match(/Market_LoadOrderSpread\(\s?(\d+)\s?\)/);
						if (res && res.length > 1) {
							storageNameId.setItem(appid + "/" + marketHashName, res[1]);
							resolve({success: true, nameid: res[1]});
						} else {
							console.log("getItemNameId failed");
							resolve({status: 0});
						}
					} else {
						console.log("getItemNameId failed");
						resolve(e.target);
					}
				};
				xhr.onerror = function(error) {
					console.log("getItemNameId error");
					resolve(error);
				};
				xhr.ontimeout = function() {
					console.log("getItemNameId timeout");
					resolve({status: 408});
				};
				xhr.send();
			}
		});
	}

	function getItemOrdersHistogram(country, currency, itemNameId) {
		return new Promise(function (resolve, reject) {
			var url = `https://steamcommunity.com/market/itemordershistogram?country=${country}&language=schinese&currency=${currency}&item_nameid=${itemNameId}&two_factor=0`;
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
			xhr.setRequestHeader("Cache-Control", "no-cache");
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(JSON.parse(e.target.response));
				} else {
					console.log("getItemOrdersHistogram failed");
					resolve(e.target);
				}
			};
			xhr.onerror = function(error) {
				console.log("getItemOrdersHistogram error");
				resolve(error);
			};
			xhr.ontimeout = function() {
				console.log("getItemOrdersHistogram timeout");
				resolve({status: 408});
			};
			xhr.send();
		});
	}

	function searchMarketGameItems(gameid, itemclass=-1, cardborder=-1, query="", l=null) {
		return new Promise(function (resolve, reject) {
			var url = `https://steamcommunity.com/market/search/render/?norender=1&query=${query}&start=0&count=100&search_descriptions=0&
					   sort_column=name&sort_dir=desc&appid=753&category_753_Event%5B%5D=any&category_753_Game%5B%5D=tag_app_${gameid}`;
			if (itemclass > -1) {
				url += `&category_753_item_class%5B%5D=tag_item_class_${itemclass}`;
			}
			if (cardborder > -1) {
				url += `&category_753_cardborder%5B%5D=tag_cardborder_${cardborder}`;
			}
			if (typeof l === "string") {
				url += `&l=${l}`;
			}
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
			xhr.setRequestHeader("Cache-Control", "no-cache");
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					resolve(JSON.parse(e.target.response));
				} else {
					console.log("searchMarketGameItems failed");
					resolve(e.target);
				}
			};
			xhr.onerror = function(error) {
				console.log("searchMarketGameItems error");
				resolve(error);
			};
			xhr.ontimeout = function() {
				console.log("searchMarketGameItems timeout");
				resolve({status: 408});
			};
			xhr.send();
		});
	}

	//等待一段时间
	function sleep(stime) {
		return new Promise(function(resolve, reject) {
			setTimeout(function() {
				resolve();
			}, stime);
		});
	}

	function getRandomInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1) + min);
	}

	//将数据保存到本地储存
	function setStorageValue(name, value) {
		try {
			localStorage.setItem(name, JSON.stringify(value));
			return true;
		} catch (e) {
			console.log(e)
			return false;
		}
	}

	//获取本地储存的数据
	function getStorageValue(name) {
		try {
			return JSON.parse(localStorage.getItem(name));
		} catch (e) {
			console.log(e)
			return null;
		}
	}

	function getCookie(name) {
		var nameEQ = name + "=";
		var ca = document.cookie.split(';');
		for (var i = 0; i < ca.length; i++) {
			var c = ca[i];
			while (c.charAt(0) == ' ')
				c = c.substring(1, c.length);
			if (c.indexOf(nameEQ) == 0)
				return decodeURIComponent(c.substring(nameEQ.length, c.length));
		}
		return null;
	}

	function errorTranslator(err) {
		const msg = {
			"0": "访问steam失败",
			"200": "无法处理结果",
			"400": "请求参数错误",
			"404": "页面不存在",
			"408": "访问steam超时",
			"429": "请求次数过多",
			"500": "服务器内部错误"
		};
		return msg[err.status] || "未知错误";
	}

	//货币信息
	var currencyData = {
		"AED": {
			"country": "AE",
			"strCode": "AED",
			"eCurrencyCode": 32,
			"strSymbol": "AED",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"ARS": {
			"country": "AR",
			"strCode": "ARS",
			"eCurrencyCode": 34,
			"strSymbol": "ARS$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": ".",
			"strSymbolAndNumberSeparator": " "
		},
		"AUD": {
			"country": "AU",
			"strCode": "AUD",
			"eCurrencyCode": 21,
			"strSymbol": "A$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"BGN": {
			"country": "BG",
			"strCode": "BGN",
			"eCurrencyCode": 42,
			"strSymbol": "лв",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"BRL": {
			"country": "BR",
			"strCode": "BRL",
			"eCurrencyCode": 7,
			"strSymbol": "R$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": ".",
			"strSymbolAndNumberSeparator": " "
		},
		"BYN": {
			"country": "BY",
			"strCode": "BYN",
			"eCurrencyCode": 36,
			"strSymbol": "Br",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": ""
		},
		"CAD": {
			"country": "CA",
			"strCode": "CAD",
			"eCurrencyCode": 20,
			"strSymbol": "CDN$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"CHF": {
			"country": "CH",
			"strCode": "CHF",
			"eCurrencyCode": 4,
			"strSymbol": "CHF",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": " ",
			"strSymbolAndNumberSeparator": " "
		},
		"CLP": {
			"country": "CL",
			"strCode": "CLP",
			"eCurrencyCode": 25,
			"strSymbol": "CLP$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": ".",
			"strSymbolAndNumberSeparator": " "
		},
		"CNY": {
			"country": "CN",
			"strCode": "CNY",
			"eCurrencyCode": 23,
			"strSymbol": "¥",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"COP": {
			"country": "CO",
			"strCode": "COP",
			"eCurrencyCode": 27,
			"strSymbol": "COL$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": ".",
			"strSymbolAndNumberSeparator": " "
		},
		"CRC": {
			"country": "CR",
			"strCode": "CRC",
			"eCurrencyCode": 40,
			"strSymbol": "₡",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": ".",
			"strSymbolAndNumberSeparator": ""
		},
		"CZK": {
			"country": "CZ",
			"strCode": "CZK",
			"eCurrencyCode": 44,
			"strSymbol": "Kč",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"DKK": {
			"country": "DK",
			"strCode": "DKK",
			"eCurrencyCode": 45,
			"strSymbol": "kr.",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"EUR": {
			"country": "EU",
			"strCode": "EUR",
			"eCurrencyCode": 3,
			"strSymbol": "€",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": " ",
			"strSymbolAndNumberSeparator": ""
		},
		"GBP": {
			"country": "GB",
			"strCode": "GBP",
			"eCurrencyCode": 2,
			"strSymbol": "£",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": ""
		},
		"HKD": {
			"country": "HK",
			"strCode": "HKD",
			"eCurrencyCode": 29,
			"strSymbol": "HK$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"HRK": {
			"country": "HR",
			"strCode": "HRK",
			"eCurrencyCode": 43,
			"strSymbol": "kn",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"HUF": {
			"country": "HU",
			"strCode": "HUF",
			"eCurrencyCode": 46,
			"strSymbol": "Ft",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"IDR": {
			"country": "ID",
			"strCode": "IDR",
			"eCurrencyCode": 10,
			"strSymbol": "Rp",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": " ",
			"strSymbolAndNumberSeparator": " "
		},
		"ILS": {
			"country": "IL",
			"strCode": "ILS",
			"eCurrencyCode": 35,
			"strSymbol": "₪",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": ""
		},
		"INR": {
			"country": "IN",
			"strCode": "INR",
			"eCurrencyCode": 24,
			"strSymbol": "₹",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"JPY": {
			"country": "JP",
			"strCode": "JPY",
			"eCurrencyCode": 8,
			"strSymbol": "¥",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"KRW": {
			"country": "KR",
			"strCode": "KRW",
			"eCurrencyCode": 16,
			"strSymbol": "₩",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"KWD": {
			"country": "KW",
			"strCode": "KWD",
			"eCurrencyCode": 38,
			"strSymbol": "KD",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"KZT": {
			"country": "KZ",
			"strCode": "KZT",
			"eCurrencyCode": 37,
			"strSymbol": "₸",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": " ",
			"strSymbolAndNumberSeparator": ""
		},
		"MXN": {
			"country": "MX",
			"strCode": "MXN",
			"eCurrencyCode": 19,
			"strSymbol": "Mex$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"MYR": {
			"country": "MY",
			"strCode": "MYR",
			"eCurrencyCode": 11,
			"strSymbol": "RM",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": ""
		},
		"NOK": {
			"country": "NO",
			"strCode": "NOK",
			"eCurrencyCode": 9,
			"strSymbol": "kr",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": ".",
			"strSymbolAndNumberSeparator": " "
		},
		"NXP": {
			"country": "NX",
			"strCode": "NXP",
			"eCurrencyCode": 9001,
			"strSymbol": "원",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": ""
		},
		"NZD": {
			"country": "NZ",
			"strCode": "NZD",
			"eCurrencyCode": 22,
			"strSymbol": "NZ$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"PEN": {
			"country": "PE",
			"strCode": "PEN",
			"eCurrencyCode": 26,
			"strSymbol": "S/.",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": ""
		},
		"PHP": {
			"country": "PH",
			"strCode": "PHP",
			"eCurrencyCode": 12,
			"strSymbol": "P",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": ""
		},
		"PLN": {
			"country": "PL",
			"strCode": "PLN",
			"eCurrencyCode": 6,
			"strSymbol": "zł",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": " ",
			"strSymbolAndNumberSeparator": ""
		},
		"QAR": {
			"country": "QA",
			"strCode": "QAR",
			"eCurrencyCode": 39,
			"strSymbol": "QR",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"RMB": {
			"country": "RM",
			"strCode": "RMB",
			"eCurrencyCode": 9000,
			"strSymbol": "刀币",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": "",
			"strSymbolAndNumberSeparator": " "
		},
		"RON": {
			"country": "RO",
			"strCode": "RON",
			"eCurrencyCode": 47,
			"strSymbol": "lei",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"RUB": {
			"country": "RU",
			"strCode": "RUB",
			"eCurrencyCode": 5,
			"strSymbol": "руб.",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": "",
			"strSymbolAndNumberSeparator": " "
		},
		"SAR": {
			"country": "SA",
			"strCode": "SAR",
			"eCurrencyCode": 31,
			"strSymbol": "SR",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"SEK": {
			"country": "SE",
			"strCode": "SEK",
			"eCurrencyCode": 33,
			"strSymbol": "kr",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"SGD": {
			"country": "SG",
			"strCode": "SGD",
			"eCurrencyCode": 13,
			"strSymbol": "S$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": ""
		},
		"THB": {
			"country": "TH",
			"strCode": "THB",
			"eCurrencyCode": 14,
			"strSymbol": "฿",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": ""
		},
		"TRY": {
			"country": "TR",
			"strCode": "TRY",
			"eCurrencyCode": 17,
			"strSymbol": "TL",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": ".",
			"strSymbolAndNumberSeparator": " "
		},
		"TWD": {
			"country": "TW",
			"strCode": "TWD",
			"eCurrencyCode": 30,
			"strSymbol": "NT$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": " "
		},
		"UAH": {
			"country": "UA",
			"strCode": "UAH",
			"eCurrencyCode": 18,
			"strSymbol": "₴",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": " ",
			"strSymbolAndNumberSeparator": ""
		},
		"USD": {
			"country": "US",
			"strCode": "USD",
			"eCurrencyCode": 1,
			"strSymbol": "$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": ",",
			"strSymbolAndNumberSeparator": ""
		},
		"UYU": {
			"country": "UY",
			"strCode": "UYU",
			"eCurrencyCode": 41,
			"strSymbol": "$U",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": ".",
			"strSymbolAndNumberSeparator": ""
		},
		"VND": {
			"country": "VN",
			"strCode": "VND",
			"eCurrencyCode": 15,
			"strSymbol": "₫",
			"bSymbolIsPrefix": false,
			"bWholeUnitsOnly": true,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": ".",
			"strSymbolAndNumberSeparator": ""
		},
		"ZAR": {
			"country": "ZA",
			"strCode": "ZAR",
			"eCurrencyCode": 28,
			"strSymbol": "R",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ".",
			"strThousandsSeparator": " ",
			"strSymbolAndNumberSeparator": " "
		}
	}

	function getCurrencyCode(currencyId) {
		for (var code in currencyData)
		{
			if (currencyData[code].eCurrencyCode == currencyId )
				return code;
		}
		return '???';
	}

	function getCurrencyCodeByCountry(country) {
		for (var code in currencyData)
		{
			if (currencyData[code].country == country )
				return code;
		}
		return 'Unknown';
	}

	//获取钱包货币信息
	function getCurrencyInfo(code, defaultCode="CNY") {
		if (!code) {
			if (unsafeWindow.g_rgWalletInfo?.wallet_currency) {
				var code1 = getCurrencyCode(unsafeWindow.g_rgWalletInfo.wallet_currency)
				if (currencyData[code1]) {
					return currencyData[code1];
				}
			}

			if (unsafeWindow.g_strCountryCode) {
				var code2 = getCurrencyCodeByCountry(unsafeWindow.g_strCountryCode)
				if (currencyData[code2]) {
					return currencyData[code2];
				}
			}
		}

		return currencyData[code] || currencyData[defaultCode];
	}

	(async function (){
		if (location.href.match(/^https?\:\/\/store\.steampowered\.com\b/)) {
			globalSettings = getStoreSettings();
		} else if (location.href.match(/^https?\:\/\/steamcommunity\.com\b/)) {
			globalSettings = getSteamCommunitySettings();
			globalCurrencyRate = readCurrencyRate();
		}
	
		steamStorePage();
		steamWishlistPage();
		steamAppStorePage();
		steamExplorePage();
		steamTradeOfferPage();
		//steamTradeOffersPage();
		steamInventoryPage();
		steamMarketListingPage();
		await steamGameCardsPage();
		steamMarketPage();
		steamAccountHistory();
		steamWorkshopImageRepair();
	
		if (location.href.match(/^https?\:\/\/steamcommunity\.com\b/)) {
			checkUpdateCurrencyRate(globalSettings, globalCurrencyRate);
		}

	})();
})();

