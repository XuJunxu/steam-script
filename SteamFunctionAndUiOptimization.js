// ==UserScript==
// @name         Steam功能和界面优化
// @namespace    SteamFunctionAndUiOptimization
// @version      2.1.13
// @description  Steam功能和界面优化
// @author       Nin9
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
		if (!location.href.match(/^https?\:\/\/steamcommunity\.com\/(sharedfiles|workshop)\/filedetails/)) {
			return;
		}

		if(typeof onYouTubeIframeAPIReady == 'function') {
			onYouTubeIframeAPIReady();
		}
	}

	//消费记录页面
	function steamAccountHistory() {
		if (!location.href.match(/^https?\:\/\/store\.steampowered\.com\/account\/history/)) {
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
					//calculateTotalPurchase();
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

				for (var index=walletHistory.length-1; index >= 0; index--) {
					var row = walletHistory[index];
					var wht_type = row.querySelector("td.wht_type > div:first-child")?.textContent.replace(/\d/g, "").trim();
					var url = row.getAttribute("onclick")?.match(/location.href='(.+)'/)[1] || "";
					var wht_total = getPriceFromSymbolStr(row.querySelector("td.wht_total").textContent);

					if (wht_type && wht_total && row.querySelector("td.wht_total").textContent.includes(currencySymbol) && url) {
						var wht_wallet_change = row.querySelector("td.wht_wallet_change").textContent.trim();

						if (url.includes("steamcommunity.com/market/#myhistory")) {  //市场交易
							if (wht_wallet_change[0] == "-") {
								allMarketTransaction.decrease += wht_total;
							} else if (wht_wallet_change[0] == "+") {
								allMarketTransaction.increase += wht_total;
							}
							allMarketTransaction.typeName.add(wht_type);
						} else if (url.includes("HelpWithItemPurchase")) {  //游戏内购买
							var transid = url.match(/transid=(\d+)/)[1];
							if (allPurchase.inGamePurchase.transid.includes(transid)) {
								allPurchase.inGamePurchase.total -= wht_total;
								allPurchase.refund.total += wht_total;
								allPurchase.refund.typeName = wht_type;
								allPurchase.refund.transid.push(transid);
							} else {
								allPurchase.inGamePurchase.total += wht_total;
								allPurchase.inGamePurchase.typeName = wht_type;
								allPurchase.inGamePurchase.transid.push(transid);
							}												
						} else if (url.includes("HelpWithTransaction")) {  //商店购买和礼物购买
							var transid = url.match(/transid=(\d+)/)[1];
							if (allPurchase.giftPurchase.transid.includes(transid)) {
								allPurchase.giftPurchase.total -= wht_total;
								allPurchase.refund.total += wht_total;
								allPurchase.refund.typeName = wht_type;
								allPurchase.refund.transid.push(transid);
							} else if (allPurchase.purchase.transid.includes(transid)) {
								allPurchase.purchase.total -= wht_total;
								allPurchase.refund.total += wht_total;
								allPurchase.refund.typeName = wht_type;
								allPurchase.refund.transid.push(transid);
							} else if (row.querySelector("td.wht_items .wth_payment a")?.hasAttribute("data-miniprofile")) {  //礼物购买
								allPurchase.giftPurchase.total += wht_total;
								allPurchase.giftPurchase.typeName = wht_type;
								allPurchase.giftPurchase.transid.push(transid);
							} else {
								allPurchase.purchase.total += wht_total;
								allPurchase.purchase.typeName = wht_type;
								allPurchase.purchase.transid.push(transid);
							}
						}
					}

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

			var symbol = currencyInfo.strSymbol;
			if (currencyInfo.bSymbolIsPrefix) {
				var statisticsContent = `<span>剩余额度：${symbol} ${(allPurchase.purchase.total - allPurchase.giftPurchase.total) / 100.0}</span>
										<span>商店购买：${symbol} ${allPurchase.purchase.total / 100.0}</span>
										<span>礼物购买：${symbol} ${allPurchase.giftPurchase.total / 100.0}</span>
										<span>游戏内购买：${symbol} ${allPurchase.inGamePurchase.total / 100.0}</span>
										<span>市场购买：${symbol} ${allMarketTransaction.decrease / 100.0}</span>
										<span>市场出售：${symbol} ${allMarketTransaction.increase / 100.0}</span>`;
			} else {
				var statisticsContent = `<span>剩余额度：${(allPurchase.purchase.total - allPurchase.giftPurchase.total) / 100.0} ${symbol} </span>
										<span>商店购买：${allPurchase.purchase.total / 100.0} ${symbol} </span>
										<span>礼物购买：${allPurchase.giftPurchase.total / 100.0} ${symbol} </span>
										<span>游戏内购买：${allPurchase.inGamePurchase.total / 100.0} ${symbol} </span>
										<span>市场购买：${allMarketTransaction.decrease / 100.0} ${symbol} </span>
										<span>市场出售：${allMarketTransaction.increase / 100.0} ${symbol} </span>`;
			}

			
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

		//计算消费金额，只计算使用钱包余额的消费记录
		function calculateTotalPurchase() {
			var purchaseGames = 0;
			var purchaseGifts = 0;
			var transidGames = [];
			var transidGifts = [];
			var refunded = [];
			var n=0, m=0;
			var walletHistory = document.querySelectorAll("tr.wallet_table_row.wallet_table_row_amt_change");
			if (walletHistory) {
				for (var row of walletHistory) {
					var wht_type = row.querySelector("td.wht_type > div:first-child")?.textContent.trim();
					var wht_total = getPriceFromSymbolStr(row.querySelector("td.wht_total").textContent);
					var wht_wallet_change = row.querySelector("td.wht_wallet_change").textContent.trim();
					var transid = row.getAttribute("onclick").match(/transid=(\d+)/)[1];
					
					if (transid && wht_wallet_change && wht_type && wht_total) {
						if (wht_wallet_change[0] == "-") {
							if (wht_type == "购买") {
								m++
								purchaseGames += wht_total;
								transidGames.push(transid);
								row.querySelector("td.wht_total").style.color = "#00A8FF";
							} else if (wht_type == "礼物购买") {
								n++;
								purchaseGifts += wht_total;
								transidGifts.push(transid);
								row.querySelector("td.wht_total").style.color = "#FF0000";
							}
						} else if (wht_type == "退款") {
							refunded.push([transid, wht_total]);
						}
					}
				}
				for (var item of refunded) {
					if (transidGames.includes(item[0])) {
						purchaseGames -= item[1];
					} else if (transidGifts.includes(item[0])) {
						purchaseGifts -= item[1];
					}
				}
			}
			console.log(purchaseGames, purchaseGifts, m, n);
		}

	}

	//steam商店搜索页面
	function steamStorePage() {  
		if(!location.href.match(/^https?\:\/\/store\.steampowered\.com\/search/)) {
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
		if(!location.href.match(/^https?\:\/\/store\.steampowered\.com\/wishlist/)) {
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
		if(!location.href.match(/^https?\:\/\/store\.steampowered\.com\/app/)) {
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
		if(!location.href.match(/^https?\:\/\/store\.steampowered\.com\/explore/)) {
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
			exploreBtn.innerHTML = '<span>生成新的队列</span>';
			var sessionid = unsafeWindow.g_sessionID;
			var result = await generateNewDiscoveryQueue(sessionid, 0);
			if (result.success) {
				var queue = result.data.queue;
				var num = 1;
				var total = queue.length;
				for (var appid of queue) {
					exploreBtn.innerHTML = `<span>探索队列中：${num}/${total}</span>`;
					var res = await clearFromQueue(sessionid, appid);
					if (!res.success) {
						break;
					}
					num++;
				}
				if (num > total) {
					exploreBtn.innerHTML = '<span>探索队列完成</span>';
				} else {
					exploreBtn.innerHTML = '<span>探索队列失败</span>';
				}
			} else {
				exploreBtn.innerHTML = '<span>生成新的队列失败</span>';
			}
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

	//交易报价页面
	function steamTradeOfferPage() {
		if(!location.href.match(/^https?\:\/\/steamcommunity\.com\/tradeoffer/)) {
			return;
		}

		appendPageControl();

		var html = `<style>#trade_offer_buttons{margin: 10px 0px 0px 10px;} .btn_move_items{padding: 5px 15px;}</style>
				<a class="btn_add_cards btn_move_items btn_green_white_innerfade">添加全部普通卡牌</a>
				<a class="btn_add_all btn_move_items btn_green_white_innerfade">添加全部物品</a>
				<a class="btn_remove_all btn_move_items btn_green_white_innerfade">移除全部物品</a>`;
		var trade_yours = document.createElement("div");
		trade_yours.innerHTML = html;
		trade_yours.className = "trade_offer_buttons trade_yours_bottons";
		document.querySelector("#trade_yours .offerheader").appendChild(trade_yours);

		var trade_theirs = document.createElement("div");
		trade_theirs.innerHTML = html;
		trade_theirs.className = "trade_offer_buttons trade_theirs_bottons";
		document.querySelector("#trade_theirs .offerheader").appendChild(trade_theirs);
		
		trade_yours.querySelector(".btn_add_cards").onclick = addAllCommonCards;
		trade_yours.querySelector(".btn_add_all").onclick = addAllItems;
		trade_yours.querySelector(".btn_remove_all").onclick = removeAllItems;
		trade_theirs.querySelector(".btn_add_cards").onclick = addAllCommonCards;
		trade_theirs.querySelector(".btn_add_all").onclick = addAllItems;
		trade_theirs.querySelector(".btn_remove_all").onclick = removeAllItems;

		var obs = new MutationObserver(removeSlots);
		obs.observe(document.querySelector("#trade_yours > div.trade_item_box"), { childList: true }); 

		var obs2 = new MutationObserver(removeSlots);
		obs2.observe(document.querySelector("#trade_theirs > div.trade_item_box"), { childList: true }); 

		document.querySelector("#inventories").onclick = itemClicked;
		document.querySelector("#your_slots").onclick = itemClicked;
		document.querySelector("#their_slots").onclick = itemClicked;

		function itemClicked(event) {
			var elem = event.target;
			if (elem.parentNode.id.match(/^item.+/) && elem.parentNode.classList.contains("item")) {
				elem = elem.parentNode;
			}
			if (elem.id.match(/^item.+/) && elem.classList.contains("item")) {
				elem.firstElementChild.addEventListener("dblclick", e => {e.stopPropagation();});  //消除单击过快触发双击事件
				unsafeWindow.OnDoubleClickItem(event, elem);
			}
		}

		function removeSlots(records, observer) {
			if (records[0].removedNodes.length > 0) {
				var itemBox = records[0].target;
				for (var node of itemBox.querySelectorAll("div.trade_item_box > div.trade_slot")) {
					itemBox.removeChild(node);
				}
			}
		}

		function addAllCommonCards(event) {
			if (event.target.parentNode.classList.contains("trade_yours_bottons")) {
				var contextData = unsafeWindow.g_rgAppContextData;
			} else if (event.target.parentNode.classList.contains("trade_theirs_bottons")) {
				var contextData = unsafeWindow.g_rgPartnerAppContextData;
			} else {
				return;
			}

			if (contextData && contextData[753] && contextData[753].rgContexts && contextData[753].rgContexts[6] && contextData[753].rgContexts[6].inventory) {
				for (var itemHolder of contextData[753].rgContexts[6].inventory.rgItemElements) {
					if (itemHolder?.rgItem?.tradable && checkCommonCard(itemHolder.rgItem.tags) && itemHolder == itemHolder.rgItem.element?.parentNode) {
						unsafeWindow.MoveItemToTrade(itemHolder.rgItem.element);
					}
				}
			}
		}

		function addAllItems(event) {
			if (event.target.parentNode.classList.contains("trade_yours_bottons")) {
				var contextData = unsafeWindow.g_rgAppContextData;
			} else if (event.target.parentNode.classList.contains("trade_theirs_bottons")) {
				var contextData = unsafeWindow.g_rgPartnerAppContextData;
			} else {
				return;
			}

			var g_ActiveInventory = unsafeWindow.g_ActiveInventory;
			var contextIds = g_ActiveInventory.rgContextIds ?? [g_ActiveInventory.contextid];
			for (var contextid of contextIds) {
				if (contextData && contextData[g_ActiveInventory.appid] && contextData[g_ActiveInventory.appid].rgContexts && 
					contextData[g_ActiveInventory.appid].rgContexts[contextid] && contextData[g_ActiveInventory.appid].rgContexts[contextid].inventory) {
					for (var itemHolder of contextData[g_ActiveInventory.appid].rgContexts[contextid].inventory.rgItemElements) {
						if (itemHolder?.rgItem?.tradable && (!itemHolder.rgItem.is_stackable) && itemHolder == itemHolder.rgItem.element?.parentNode) {
							unsafeWindow.MoveItemToTrade(itemHolder.rgItem.element);
						}
					}
				}
			}
		}

		function removeAllItems(event) {
			if (event.target.parentNode.classList.contains("trade_yours_bottons")) {
				var select = "#your_slots div.item";
			} else if (event.target.parentNode.classList.contains("trade_theirs_bottons")) {
				var select = "#their_slots div.item";
			} else {
				return;
			}

			for (var item of document.querySelectorAll(select)) {
				unsafeWindow.MoveItemToInventory(item);
			}
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

	}

	//库存界面
	function steamInventoryPage(){  
		if(!location.href.match(/^https?\:\/\/steamcommunity\.com\/(id|profiles)\/[^\/]+\/inventory/)) {
			return;
		}

		addSteamCommunitySetting();

		if (document.querySelector("#no_inventories")) {
			return;
		}

		var currencyInfo = getCurrencyInfo(globalSettings.currency_code);
		var sellTotalPriceReceive = 0;
		var sellTotalPriceBuyerPay = 0;
		var sellCount = 0;

		var priceGramLoaded = false;
		var inventoryAppidForSell = 0;
		var inventoryAppidForLink = 0;

		//修改页面布局
		if (globalSettings.inventory_set_style) {
			changeInventoryPage();
			appendPageControl();
		}

		//只显示普通卡牌
		if (globalSettings.inventory_set_filter) {
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
			styleElem.innerHTML = `div#inventory_logos {margin: 10px; padding: 0px; width: 500px;} 
									div#tabcontent_inventory {padding-top: 12px;}
									div.inventory_rightnav {margin: 0px 12px 12px auto; display: flex;}
									div.inventory_rightnav>a, div.inventory_rightnav>div {flex: 0 0 auto; overflow: hidden; margin-bottom: auto;}
									a.btn_medium>span, div#inventory_more_link>span {line-height: 22px;}
									.btn_reload_inventory {margin-right: 12px;}
									.tabitems_ctn>.games_list_separator.responsive_hidden {display: none;}
									.btn_small>span {user-select: none;}`;
			document.body.appendChild(styleElem);
		
			var inventory_links = document.querySelector("div.inventory_links");
			var inventory_rightnav = document.querySelector("div.inventory_rightnav");
			var tabcontent_inventory = document.querySelector("#tabcontent_inventory");
			if (inventory_links && inventory_rightnav && tabcontent_inventory) {
				//调整交易报价按键的位置
				inventory_links.style.margin = "0px";
				inventory_rightnav.style.marginRight = "12px";
				tabcontent_inventory.insertBefore(inventory_rightnav, tabcontent_inventory.firstElementChild);

				//添加重新加载库存按键
				var reloadInventoryBtn = document.createElement("a");
				reloadInventoryBtn.className = "btn_darkblue_white_innerfade btn_medium btn_reload_inventory";
				reloadInventoryBtn.innerHTML = "<span>重新加载库存</span>";
				inventory_rightnav.insertBefore(reloadInventoryBtn, inventory_rightnav.firstElementChild);
				reloadInventoryBtn.onclick = function() { window.location.reload(); };
			}

			//调整LOGO的位置
			var inventory_logos = document.querySelector("div#inventory_logos");
			document.querySelector("div#active_inventory_page>div.inventory_page_left")?.insertBefore(inventory_logos, document.querySelector("div#inventory_pagecontrols").nextElementSibling);
		}
		
		//等待物品加载完设置过滤
		function waitLoadInventory() {  
			var isLoaded = true;
			if (typeof unsafeWindow.g_ActiveInventory === "undefined" || unsafeWindow.g_ActiveInventory == null || !unsafeWindow.g_ActiveInventory.appid) {
				isLoaded = false;
			}
			if (isLoaded && unsafeWindow.g_ActiveInventory.appid != 753) {
				return;
			}
			if (isLoaded && !(unsafeWindow.g_ActiveInventory.m_$Inventory && unsafeWindow.g_ActiveInventory.m_$Inventory.length > 0)) {
				isLoaded = false;
			}
			if (document.querySelectorAll("#filter_options .econ_tag_filter_category").length == 0) {  //使筛选条件可用
				unsafeWindow.ShowTagFilters();
				unsafeWindow.HideTagFilters();
				isLoaded = false;
			}
			if (!isLoaded) {
				setTimeout(function() {
					waitLoadInventory();
				}, 100);
				return;
			}
			var checkbox = document.querySelector("#tag_filter_753_0_cardborder_cardborder_0") || document.querySelector("#tag_filter_753_6_cardborder_cardborder_0");
			var checkbox2 = document.querySelector("#tag_filter_753_0_misc_tradable") || document.querySelector("#tag_filter_753_6_misc_tradable");
			var checkbox3 = document.querySelector("#tag_filter_753_0_misc_marketable") || document.querySelector("#tag_filter_753_6_misc_marketable");
			if (checkbox) {
				checkbox.click();
			}
			if (checkbox2) {
				checkbox2.click();
			}
			if (checkbox3) {
				checkbox3.click();
			}
		}

		//在右侧大图片上方添加市场价格信息和出售按键
		function appendPriceGramAndSellBtn() {
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `.price_gram_table {display: flex; margin: 5px 10px; cursor: pointer;} .price_gram_table>div:first-child {margin-right: 5px;} .price_gram_table>div {border: 1px solid #000000;} 
									.table_title {text-align: center; font-size: 12px;} th, td {background: #00000066; width: 80px; text-align: center; font-size: 12px; line-height: 18px;} .price_overview {margin-left: 15px;} 
									.price_overview>span {margin-right: 20px;} .sell_price_input {text-align: center; margin-right: 2px; width: 100px;} .sell_btn_container {margin: 5px 10px;} 
									.quick_sell_btn {margin: 5px 5px 0px 0px;} .quick_sell_btn > span {padding: 0px 5px; pointer-events: none;} .price_receive, .price_receive_2 {margin-left: 10px; font-size: 12px;}
									.show_market_info {border-radius: 2px; background: #000000; color: #FFFFFF; margin: 10px 0px 0px 10px; cursor: pointer; padding: 2px 15px; display: inline-block;} 
									.show_market_info:hover {background: rgba(102, 192, 244, 0.4)} .price_gram, .price_gram div{font-size: 12px; font-weight: normal;}`;
			document.body.appendChild(styleElem);

			var html = `<div><a class="show_market_info">显示市场价格信息</a></div><div class="market_info"><div class="price_gram"></div><div class="price_overview"></div></div>
						<div class="sell_btn_container">
						<div><input class="sell_price_input" type="number" step="0.01" min="0.03" style="color: #FFFFFF; background: #000000; border: 1px solid #666666;">
						<a class="btn_small btn_green_white_innerfade sell_comfirm"><span>确认出售</span></a>
						<a class="btn_small btn_green_white_innerfade sell_all_same" title="出售全部相同的物品"><span>批量出售</span></a></div>
						<div><label class="price_receive" style="margin-right: 10px;"></label><label class="price_receive_2"></label></div>
						<div class="sell_btns"></div></div>`;
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

					if (globalSettings.inventory_sell_btn && selectedItem.description.marketable) {
						document.querySelector("#price_gram_container0 .sell_price_input").oninput = event => showPriceReceive(event, selectedItem);
						document.querySelector("#price_gram_container1 .sell_price_input").oninput = event => showPriceReceive(event, selectedItem);
						document.querySelector("#price_gram_container0 .sell_price_input").onmousewheel = event => event.preventDefault();
						document.querySelector("#price_gram_container1 .sell_price_input").onmousewheel = event => event.preventDefault();
						document.querySelector("#price_gram_container0 .sell_comfirm").onclick = event => sellItemCustom(event, selectedItem);
						document.querySelector("#price_gram_container1 .sell_comfirm").onclick = event => sellItemCustom(event, selectedItem);
						document.querySelector("#price_gram_container0 .sell_all_same").onclick = event => sellAllSameItem(event, selectedItem);
						document.querySelector("#price_gram_container1 .sell_all_same").onclick = event => sellAllSameItem(event, selectedItem);
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

			//将logo替换成上架日志
			var logHtml = `<style>#inventory_logos {height: auto;} #inventory_applogo {display: none;} #sell_log_text {font-size: 12px; max-height: 200px; overflow-y: auto; margin-top: 10px;} 
							#sell_log_total {font-weight: bold; margin-top: 5px}</style>
							<div id="sell_log_text"></div><div id="sell_log_total"></div><div><a id="clear_sell_log" style="display: none; margin-top: 10px" class="pagecontrol_element pagebtn">清空</a></div>`;
			var logContainer = document.createElement("div");
			logContainer.innerHTML = logHtml;

			document.querySelector("#inventory_logos").appendChild(logContainer);
			document.querySelector("#clear_sell_log").onclick = function() {
				sellTotalPriceReceive = 0;
				sellTotalPriceBuyerPay = 0;
				sellCount = 0;
				document.querySelector("#sell_log_text").innerHTML = "";
				document.querySelector("#sell_log_total").innerHTML = "";
				document.querySelector("#clear_sell_log").style.display = "none";
			};
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
			}
		}

		async function showPriceGram(appid, hashName, item) {
			var data0 = await getItemNameId(appid, hashName);
			if (data0.success) {
				var itemNameId = data0.nameid;
				var data1 = await getItemOrdersHistogram(currencyInfo.country, currencyInfo.eCurrencyCode, itemNameId);
				if (data1.success && item.assetid == unsafeWindow.g_ActiveInventory.selectedItem.assetid) {
					priceGramLoaded = true;
					var html1 = `<div class="price_gram_table"><div><div class="table_title">出售</div>${data1.sell_order_table || data1.sell_order_summary}</div><div><div class="table_title">购买</div>${data1.buy_order_table || data1.buy_order_summary}</div></div>`;
					document.querySelector("#price_gram_container0 .price_gram").innerHTML = html1;
					document.querySelector("#price_gram_container1 .price_gram").innerHTML = html1;
					document.querySelector("#price_gram_container0 .price_gram_table").onclick = function() {
						dialogPriceInfo.showTable(appid, hashName, data1, currencyInfo);
					};
					document.querySelector("#price_gram_container1 .price_gram_table").onclick = function() {
						dialogPriceInfo.showTable(appid, hashName, data1, currencyInfo);
					};

					//添加快速出售按键
					if (globalSettings.inventory_sell_btn && item.description.marketable) {
						var btnHtml = "";
						if (data1.lowest_sell_order) {
							document.querySelector("#price_gram_container0 .sell_price_input").value = (data1.lowest_sell_order / 100.0).toFixed(2);
							document.querySelector("#price_gram_container1 .sell_price_input").value = (data1.lowest_sell_order / 100.0).toFixed(2);
							if (data1.price_prefix) {
								var priceStr0 = data1.price_prefix + " " + (data1.lowest_sell_order / 100.0).toFixed(2);
								var priceStr1 = data1.price_prefix + " " + ((data1.lowest_sell_order - 1) / 100.0).toFixed(2);
							} else {
								var priceStr0 = (data1.lowest_sell_order / 100.0).toFixed(2) + " " + data1.price_suffix;
								var priceStr1 = ((data1.lowest_sell_order - 1) / 100.0).toFixed(2) + " " + data1.price_suffix;
							}
							btnHtml += `<a class="btn_small btn_green_white_innerfade quick_sell_btn" data-price="${data1.lowest_sell_order}"><span>${priceStr0}</span></a>`;
							btnHtml += `<a class="btn_small btn_green_white_innerfade quick_sell_btn" data-price="${data1.lowest_sell_order - 1}"><span>${priceStr1}</span></a>`;
						}
						if (data1.highest_buy_order) {
							if (data1.price_prefix) {
								var priceStr2 = data1.price_prefix + " " + (data1.highest_buy_order / 100.0).toFixed(2);
							} else {
								var priceStr2 = (data1.highest_buy_order / 100.0).toFixed(2) + " " + data1.price_suffix;
							}
							btnHtml += `<a class="btn_small btn_green_white_innerfade quick_sell_btn" data-price="${data1.highest_buy_order}"><span>${priceStr2}</span></a>`;
						}
		
						document.querySelector("#price_gram_container0 .sell_btns").innerHTML = btnHtml;
						document.querySelector("#price_gram_container1 .sell_btns").innerHTML = btnHtml;
						document.querySelector("#price_gram_container0 .sell_btns").onclick = event => quickSellItem(event, item);
						document.querySelector("#price_gram_container1 .sell_btns").onclick = event => quickSellItem(event, item);
						document.querySelector("#price_gram_container0 .sell_price_input").dispatchEvent(new Event("input"));
						document.querySelector("#price_gram_container1 .sell_price_input").dispatchEvent(new Event("input"));
					}
				}
			}
		}

		async function showPriceOverview(appid, marketHashName, item) {
			var data = await getPriceOverview(currencyInfo.country, currencyInfo.eCurrencyCode, appid, marketHashName);
			if (data.success && item.assetid == unsafeWindow.g_ActiveInventory.selectedItem.assetid) {
				var html = "";
				html += data.lowest_price ? `<span>${data.lowest_price}</span>` : "";
				html += data.volume ? `<span>${data.volume} 个</span>` : "";
				html += data.median_price ? `<span>${data.median_price}</span>` : "";
				document.querySelector("#price_gram_container0 .price_overview").innerHTML = html;
				document.querySelector("#price_gram_container1 .price_overview").innerHTML = html;
				
				if (globalSettings.inventory_sell_btn && !priceGramLoaded && data.lowest_price && item.description.marketable) {
					document.querySelector("#price_gram_container0 .sell_price_input").value = (getPriceFromSymbolStr(data.lowest_price) / 100.0).toFixed(2);
					document.querySelector("#price_gram_container1 .sell_price_input").value = (getPriceFromSymbolStr(data.lowest_price) / 100.0).toFixed(2);
					document.querySelector("#price_gram_container0 .sell_price_input").dispatchEvent(new Event("input"));
					document.querySelector("#price_gram_container1 .sell_price_input").dispatchEvent(new Event("input"));
				}
			}
		}

		function showPriceReceive(event, item) {
			var elem = event.target;
			var label = elem.parentNode.parentNode.querySelector(".price_receive");
			var label2 = elem.parentNode.parentNode.querySelector(".price_receive_2");
			var amount = isNaN(Number(elem.value)) ? 0 : Math.round(Number(elem.value) * 100);
			var price = calculatePriceYouReceive(amount, item);
			var pay = calculatePriceBuyerPay(price, item);
			if (currencyInfo.bSymbolIsPrefix) {
				label.innerHTML = `${currencyInfo.strSymbol} ${(pay / 100.0).toFixed(2)} (${currencyInfo.strSymbol} ${(price / 100.0).toFixed(2)})`;
			} else {
				label.innerHTML = `${(pay / 100.0).toFixed(2)} ${currencyInfo.strSymbol} (${(price / 100.0).toFixed(2)} ${currencyInfo.strSymbol})`;
			}
			if (currencyInfo.strCode == globalCurrencyRate.wallet_code && currencyInfo.strCode != globalCurrencyRate.second_code) {
				var [pay2, price2] = calculateSecondPrice(price, item);
				var currencyInfo2 = getCurrencyInfo(globalCurrencyRate.second_code, true);
				if (currencyInfo2.bSymbolIsPrefix) {
					label2.innerHTML = `${currencyInfo2.strSymbol} ${(pay2 / 100.0).toFixed(2)} (${currencyInfo2.strSymbol} ${(price2 / 100.0).toFixed(2)})`;
				} else {
					label2.innerHTML = `${(pay2 / 100.0).toFixed(2)} ${currencyInfo2.strSymbol} (${(price2 / 100.0).toFixed(2)} ${currencyInfo2.strSymbol})`;
				}
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
			var hashName = item.description.market_hash_name;
			var m_rgAssets = unsafeWindow.g_rgAppContextData[item.appid].rgContexts[parseInt(item.contextid)].inventory.m_rgAssets;
			if (hashName && m_rgAssets) {
				var input = event.currentTarget.parentNode.querySelector("input");
				var amount = isNaN(Number(input.value)) ? 0 : Math.round(Number(input.value) * 100);
				var price = calculatePriceYouReceive(amount, item);
				var buyerPay = calculatePriceBuyerPay(price, item);
				for (let assetid in m_rgAssets) {
					let it = m_rgAssets[assetid];
					if (it?.description?.marketable && it.description.market_hash_name == hashName && !it.element.getAttribute("data-sold")) {
						await sellSelectedItem(0, it, price, buyerPay);
					}
				}
			}
		}

		async function sellSelectedItem(amount, item, priceReceive=0, pricePay=0) {
			var price = priceReceive || calculatePriceYouReceive(amount, item);
			if (price > 0) {
				var data = await sellItem(unsafeWindow.g_sessionID, item.appid, item.contextid, item.assetid, 1, price);
				if (data.success) {
					item.element.style.background = "green";
					item.element.setAttribute("data-sold", "1");

					var buyerPay = pricePay || calculatePriceBuyerPay(price, item);
					sellTotalPriceBuyerPay += buyerPay;
					sellTotalPriceReceive += price;
					sellCount ++;

					var symbol = currencyInfo.strSymbol;
					if (currencyInfo.bSymbolIsPrefix) {
						var strPrice = symbol + " " + (price / 100.0).toFixed(2);
						var strBuyerPay = symbol + " " + (buyerPay / 100.0).toFixed(2);
						var strTotalReceive = symbol + " " + (sellTotalPriceReceive / 100.0).toFixed(2);
						var strTotalBuyerPay = symbol + " " + (sellTotalPriceBuyerPay / 100.0).toFixed(2);
					} else {
						var strPrice =  (price / 100.0).toFixed(2) + " " + symbol;
						var strBuyerPay = (buyerPay / 100.0).toFixed(2) + " " + symbol;
						var strTotalReceive = (sellTotalPriceReceive / 100.0).toFixed(2) + " " + symbol;
						var strTotalBuyerPay = (sellTotalPriceBuyerPay / 100.0).toFixed(2) + " " + symbol;
					}
					var logText = `${sellCount} - ${item.description.name} 已在市场上架，售价为 ${strBuyerPay}，将收到 ${strPrice}` + (data.requires_confirmation ? " (需要确认)" : "") + "<br>";
					var logTotal = `累计上架物品的总价为 ${strTotalBuyerPay}，将收到 ${strTotalReceive}`;
					document.querySelector("#sell_log_text").innerHTML += logText;
					document.querySelector("#sell_log_total").innerHTML = logTotal;
				} else {
					var logText = `Failed - ${item.description.name} 上架市场失败，原因：${data.message || errorTranslator(data)}` + "<br>";
					document.querySelector("#sell_log_text").innerHTML += logText;
				}
				document.querySelector("#sell_log_text").scroll(0, document.querySelector("#sell_log_text").scrollHeight);
				document.querySelector("#clear_sell_log").style.display = "inline-block";
			}
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
					if (selectedItem.appid == 753 && selectedItemIsCard(selectedItem)) {
						var isfoil = hashName.search(/Foil/) < 0 ? false : true;
						html += `<a class="btn_small btn_grey_white_innerfade" href="https://steamcommunity.com/my/gamecards/${feeApp}/${isfoil ? '?border=1' : ''}" target="_blank"><span>打开徽章页面</span></a>
								<a class="btn_small btn_grey_white_innerfade" href="https://store.steampowered.com/app/${feeApp}" target="_blank"><span>打开商店页面</span></a>
								<a class="btn_small btn_grey_white_innerfade" href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${feeApp}" target="_blank"><span>Exchange页面</span></a>
								<a class="btn_small btn_grey_white_innerfade" href="https://steamcommunity.com/market/search?appid=753&category_753_Game[]=tag_app_${feeApp}" target="_blank"><span>查看社区物品</span></a>`;
						iconElem0.style.display = "flex";
						iconElem1.style.display = "flex";
					} else {
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

		function selectedItemIsCard(selectedItem) {
			for(var tag of selectedItem.description.tags) {
				if (tag.category == "cardborder") {
					return true;
				}
			}
			return false;
		}

		function selectedItemMarketable(selectedItem) {
			if (selectedItem.description.marketable) {
				return true;
			} else if (selectedItem.description.owner_descriptions) {
				for (var des of selectedItem.description.owner_descriptions) {
					if (des.value.search(/\[date\]\d{10}\[\/date\]/) >= 0) {
						return true;
					}
				}
			}
			return false;
		}
	}

	//steam市场界面
	function steamMarketPage() {  
		if(!location.href.match(/^https?\:\/\/steamcommunity\.com\/market(?!\/listings|\/search)/)) {
			return;
		}

		addSteamCommunitySetting();

		var currencyInfo = getCurrencyInfo(globalSettings.currency_code);
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

		if (globalSettings.market_adjust_selllistings || globalSettings.market_adjust_history) {
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `.market_action_btn {padding: 0px 5px; margin-right: 8px; font-size: 12px;} 
								.control_action_container {padding-left: 6px; display: inline-block; position: relative;}
								.Listing_page_control {margin-top: 10px; user-select: none;}
								.Listing_page_control .market_paging_controls {margin-top: 2px;}
								.market_listing_check {position: absolute; top: 15px; right: 20px; cursor: pointer; transform: scale(2); }
								.market_listing_table_header {text-align: center;}
								.market_listing_game_name_link {color: inherit;} 
								.market_listing_game_name_link:hover {text-decoration: underline;}
								.market_price_can_click {cursor: pointer;} .market_price_can_click:hover {background: #324965;}`;
			document.body.appendChild(styleElem);
		}

		if (globalSettings.market_adjust_selllistings) {
			adjustMySellListings();
			adjustMyBuyOrder();
		}

		if (globalSettings.market_adjust_history) {
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `.history_action_btn_container .history_page_number {width: 45px; height: 18px; border-radius: 3px; color: #fff; background-color: #324965; font-family: "Motiva Sans", Sans-serif; border-color: #45566A; margin: 1px 5px 0 -5px; text-align: center;}
								.history_action_btn_container .history_total_page {margin-right: 5px;}
								.wait_loading_history {position: absolute; height: 20px; top: 2px;}
								.history_page_number::-webkit-outer-spin-button, .history_page_number::-webkit-inner-spin-button{-webkit-appearance: none !important;}`;
			document.body.appendChild(styleElem);
			document.querySelector("#tabMyMarketHistory").addEventListener("click", showMarketHistory, true);
		}

		//调整出售物品列表
		async function adjustMySellListings() {
			var marketListings = document.querySelector("#tabContentsMyActiveMarketListingsRows");
			if (!marketListings) {
				return;
			}

			document.querySelector("#tabMyListings").addEventListener("click", showMarketMyListings);

			marketListings.innerHTML = "<div style='text-align: center;'><img src='https://community.steamstatic.com/public/images/login/throbber.gif' alt='载入中'></div>";
			
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `#tabContentsMyListings .market_pagesize_options, #tabContentsMyListings #tabContentsMyActiveMarketListings_ctn {display: none;}
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
				var gameName = listings[i].querySelector(".market_listing_game_name").textContent.toLowerCase();
				var itemName = listings[i].querySelector(".market_listing_item_name_link").textContent.toLowerCase();
				var pricePay = getPriceFromSymbolStr(listings[i].querySelector(".market_listing_price > span > span:first-child").textContent);
				var pricReceive = getPriceFromSymbolStr(listings[i].querySelector(".market_listing_price  > span > span:last-child").textContent);
				listingsTemp.push([gameName, itemName, pricePay, listings[i]]);

				addRowCheckbox(listings[i]);
				addGameCardsLink(listings[i]);

				listings[i].querySelector(".market_listing_my_price").onclick = showListingPriceInfo;
				totalPay += pricePay;
				totalReceive += pricReceive;

				var assetInfo = getListingAssetInfo(listings[i]);
				var itemType = "";
				if (assetInfo.appid == 753 && assetInfo.contextid == "6" && assetInfo.owner_actions[0].link.includes("https://steamcommunity.com/my/gamecards/")) {
					if (assetInfo.market_hash_name.includes("Foil")) {
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
			}

			//添加页面导航
			addMarketPageControl();

			//显示总售价
			if (listings.length == totalCount) {
				document.querySelector("#my_market_selllistings_number").textContent += ` ▶ ${(totalPay / 100.0).toFixed(2)} ▶ ${(totalReceive / 100.0).toFixed(2)}`;
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
				if (row && row.id.match(/mybuyorder_\d+/)) {
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
			for (var row of buyOrderRows) {
				addRowCheckbox(row);
				addGameCardsLink(row);

				buyOrderTable.appendChild(row);
				buyOrderRowsTimeSort.push(row);

				var priceCell = row.querySelector(".market_listing_my_price:not(.market_listing_buyorder_qty)");
				priceCell.classList.add("market_price_can_click");
				priceCell.onclick = showListingPriceInfo;
			}
			buyOrderListing.appendChild(buyOrderTable);

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

		function showMarketMyListings() {
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

			var html = `<div class="history_action_btn_container control_action_container"><a class="update_market_history market_action_btn pagebtn">刷新</a><a class="goto_history_page market_action_btn pagebtn">转到</a>
						<input type="number" class="history_page_number" min="1"><span class="history_total_page"></span>
						<img class="wait_loading_history" src="https://community.steamstatic.com/public/images/login/throbber.gif" alt="载入中" style="display: none;">
						<span class="get_history_failed" style="display: none;">Failed</span></div>
						<div class="market_paging_controls"><span class="pagebtn prev_page"><</span><span class="page_link"></span><span class="pagebtn next_page">></span></div><div style="clear: both;"></div>`;
			controlBefore.innerHTML = html;
			controlAfter.innerHTML = html;
			var marketTable = document.querySelector("#tabContentsMyMarketHistoryTable");
			marketTable.insertBefore(controlBefore, marketTable.querySelector("#tabContentsMyMarketHistoryRows"));
			marketTable.appendChild(controlAfter);
			controlBefore.querySelector(".market_paging_controls").onclick = historyPageControlClick;
			controlAfter.querySelector(".market_paging_controls").onclick = historyPageControlClick;
			controlBefore.querySelector(".history_action_btn_container").onclick = historyActionBtnClick;
			controlAfter.querySelector(".history_action_btn_container").onclick = historyActionBtnClick;
		}

		function historyActionBtnClick(event) {
			var elem = event.target;
			if (elem.classList.contains("update_market_history")) {
				updateMarketHistory(1);
			} else if (elem.classList.contains("goto_history_page")) {
				var input = event.currentTarget.querySelector(".history_page_number");
				var page = isNaN(parseInt(input.value)) ? 0 : parseInt(input.value);
				updateMarketHistory(page);
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

			document.querySelector("#history_page_control_before .history_page_number").value = page.toString();
			document.querySelector("#history_page_control_after .history_page_number").value = page.toString();

			var content = `/ ${maxPage} 页`;
			document.querySelector("#history_page_control_before .history_total_page").textContent = content;
			document.querySelector("#history_page_control_after .history_total_page").textContent = content;
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
					cancelSelectedBuyOrder(rowsToCancel);
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
						<div class="market_paging_controls"><span class="pagebtn prev_page"><</span><span class="page_link"></span><span class="pagebtn next_page">></span></div><div style="clear: both;"></div>`;
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
		}

		//更新页面导航中的页面编号
		function updateMarketPageControl(page) {
			var maxPage = marketMyListingsPage.length;
			var html = createPageLink(page, maxPage);

			document.querySelector("#market_page_control_before .page_link").innerHTML = html;
			document.querySelector("#market_page_control_after .page_link").innerHTML = html;
			document.querySelector(`#market_page_control_before .page_link .market_paging_pagelink[data-page-num="${page}"]`).classList.add("active");
			document.querySelector(`#market_page_control_after .page_link .market_paging_pagelink[data-page-num="${page}"]`).classList.add("active");
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
							var hashName = encodeURIComponent(assetInfo.market_hash_name);
							nameElem.innerHTML = `<a class="market_listing_item_name_link" href="https://steamcommunity.com/market/listings/${assetInfo.appid}/${hashName}" target="_blank">${nameElem.innerHTML}</a>`;
							
							var priceElem = row.querySelector(".market_listing_their_price");
							priceElem.classList.add("market_price_can_click");
							priceElem.onclick = showListingPriceInfo2;
							if (!priceElem.querySelector(".market_listing_price").textContent.trim()) {
								priceElem.querySelector(".market_listing_price").textContent = "...";
							}
							
							addGameCardsLink(row);
						}
					}
				}
			}
		}

		function getListingAssetInfo(listing) {
			var args = listing.querySelector("a.item_market_action_button_edit").href.match(/RemoveMarketListing\(([^\(\)]+)\)/)[1].replace(/ /g, "").split(",");
			return unsafeWindow.g_rgAssets[eval(args[2])][eval(args[3])][eval(args[4])];
		}

		//在物品右侧添加复选框
		function addRowCheckbox(elem) {
			var checkbox = document.createElement("input");
			checkbox.setAttribute("type", "checkbox");
			checkbox.className = "market_listing_check";
			elem.querySelector(".market_listing_cancel_button").appendChild(checkbox);
		}

		//在价格右侧显示最低售价和最高求购价
		function addPriceLabel(listing, data) {
			if (listing.querySelector(".market_price_container")) {
				return;
			}
			var sellPrice = "null";
			var buyPrice = "null";
			if (data.lowest_sell_order) {
				sellPrice = (parseInt(data.lowest_sell_order) / 100.0).toFixed(2);
				sellPrice = data.price_prefix ? `${data.price_prefix} ${sellPrice}` : `${sellPrice} ${data.price_suffix}`;
			}
			if (data.highest_buy_order) {
				buyPrice = (parseInt(data.highest_buy_order) / 100.0).toFixed(2);
				buyPrice = data.price_prefix ? `${data.price_prefix} ${buyPrice}` : `${buyPrice} ${data.price_suffix}`;
			}
			var elem = document.createElement("div");
			elem.className = "market_price_container";
			elem.innerHTML = `<div class="market_price_label" title="最低出售价格">${sellPrice}</div><div class="market_price_label" title="最高求购价格">${buyPrice}</div>`;
			listing.querySelector(".market_listing_my_price").appendChild(elem);
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
			var res = listing.querySelector("a.market_listing_item_name_link").href.match(/steamcommunity\.com\/market\/listings\/(\d+)\/([^\/]+)/);
			var appid = res[1];
			var marketHashName = res[2];
			dialogPriceInfo.show(appid, marketHashName, currencyInfo, function(data) {
				if (add) {
					addPriceLabel(listing, data);
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
			for (let listing of listings) {
				var assetInfo = getListingAssetInfo(listing);
				var hashName = getMarketHashName(assetInfo);
				var data = await getCurrentItemOrdersHistogram(currencyInfo.country, currencyInfo.eCurrencyCode, assetInfo.appid, hashName);
				if (data) {
					addPriceLabel(listing, data);
					dialogPriceInfo.checkUpdateItemOrdersHistogram(assetInfo.appid, hashName, data, currencyInfo);
				}
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
				location.reload();
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
									.market_listing_check {position: absolute; top: 15px; right: 20px; cursor: pointer; transform: scale(2); }
									#market_page_control_before {margin-top: 10px; user-select: none;}
									.market_action_btn_container {display: inline-block; padding-left: 6px;}
									.market_action_btn {margin-right: 10px; font-size: 12px;}`;
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
				for (var elem of listingRows.querySelectorAll(".market_listing_row")) {
					var checkbox = document.createElement("input");
					checkbox.setAttribute("type", "checkbox");
					checkbox.className = "market_listing_check";
					elem.querySelector(".market_listing_cancel_button").appendChild(checkbox);
				}
			}
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
			var currencyInfo = getCurrencyInfo(globalSettings.currency_code);
		
			var data = await getPriceOverview(currencyInfo.country, currencyInfo.eCurrencyCode, appid, marketHashName);
			if (data.success) {
				var html = "";
				html += data.lowest_price ? `<span>最低售价：${data.lowest_price}</span>` : "";
				html += data.volume ? `<span>24h销量：${data.volume} 个</span>` : "";
				html += data.median_price ? `<span>24h售价：${data.median_price}</span>` : "";
			} else {
				var html = `<span>${errorTranslator(data)}</span>`;
			}
			elem.innerHTML = html;
		}

		function appendMarketlistingPageLinkBtn() {  //添加链接按键
			var res = location.href.match(/\/market\/listings\/753\/(\d+)\-/);
			if (res && res.length > 1) {
				var appid = res[1];
				var isfoil = location.href.search(/Foil/) < 0 ? false : true;
				var linkElem = document.createElement("div");
				linkElem.innerHTML = `<style>.page_link_btn {border-radius: 2px; cursor: pointer; background: black; color: white; margin: 10px 0px 0px 0px; display: inline-block;} .page_link_btn > span {padding: 0px 15px; font-size: 14px; line-height: 25px;} .page_link_btn:hover {background: rgba(102, 192, 244, 0.4)}</style>
										<a href="https://steamcommunity.com/my/gamecards/${appid}/${isfoil ? '?border=1' : ''}" class="page_link_btn" target="_blank"><span>打开徽章页面</span></a>
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
	function steamGameCardsPage() {  
		if(!location.href.match(/^https?\:\/\/steamcommunity\.com\/(id|profiles)\/[^\/]+\/gamecards/)) {
			return;
		}

		addSteamCommunitySetting();

		var currencyInfo = getCurrencyInfo(globalSettings.currency_code);

		if (!unsafeWindow.g_rgWalletInfo) {
			unsafeWindow.g_rgWalletInfo = {
				wallet_fee: "1",
				wallet_fee_base: "0",
				wallet_fee_minimum: "1",
				wallet_fee_percent: "0.05",
				wallet_max_balance: "12500000",
				wallet_publisher_fee_percent_default: "0.10",
			}
		}

		//修改页面布局
		if (globalSettings.gamecards_set_style) {
			changeGameCardsPage();
		}

		//添加链接按键
		if (globalSettings.gamecards_show_priceoverview || globalSettings.gamecards_append_linkbtn) {
			appendCardsPageLinkBtn();
			appendItemPriceInfoBtn();
			appendMyBuyOrders();
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
			buttons.innerHTML = `<a class="btn_grey_grey btn_medium" style="margin: 8px 4px 0 0;" href="https://store.steampowered.com/app/${appid}" target="_blank"><span>打开商店页面</span></a>
								 <a class="btn_grey_grey btn_medium" style="margin: 8px 4px 0 0;" href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${appid}" target="_blank"><span>打开Exchange页面</span></a>
								 <a class="btn_grey_grey btn_medium" style="margin: 8px 4px 0 0;" href="https://steamcommunity.com/market/search?appid=753&category_753_Game[]=tag_app_${appid}" target="_blank"><span>查看该游戏社区物品</span></a>
								 <a class="btn_grey_grey btn_medium" id="multi_buy_order" style="margin: 8px 0 0 0; display: none;"><span>批量购买卡牌</span></a>`;

			var elem = document.querySelector("div.badge_detail_tasks>div.gamecards_inventorylink");
			if (!elem) {
				elem = document.createElement("div");
				elem.className = "gamecards_inventorylink";
				document.querySelector("div.badge_detail_tasks").insertBefore(elem, document.querySelector("div.badge_detail_tasks").firstElementChild);
			}

			elem.appendChild(buttons);
		}

		//卡牌下方添加链接和价格
		async function appendItemPriceInfoBtn() {
			var styleElem = document.createElement("style");
			styleElem.innerHTML = ".market_link {display: block; color: #EBEBEB; font-size: 12px; background: #00000066; padding: 3px; text-align: center;} .market_link:hover {background: #7bb7e355;}";
			document.body.appendChild(styleElem);

			var gameid = getGameId();

			var res1 = location.href.match(/\/gamecards\/\d+\/?\?border=(\d)/);
			if (res1 && res1.length > 1) {
				var cardborder = res1[1];
			} else {
				var cardborder = 0;
			}

			var cardElems = document.querySelectorAll("div.badge_card_set_card");
			var linkElems = document.querySelectorAll("div.gamecards_inventorylink>a");
			for (var le of linkElems) {
				var hashNameList = le.href.match(/(?<=items\[\]\=).+?(?=\&)/g);
				if (hashNameList && hashNameList.length > 0) {
					break;
				}
			}

			if (hashNameList && hashNameList.length > 0 && hashNameList.length == cardElems.length) {
				let cardAssets1 = [];
				for (var i = 0; i < cardElems.length; i++) {
					var cardElem = cardElems[i];
					var hashName = hashNameList[i];

					var icon = cardElem.querySelector("img.gamecard").src;
					var title1 = cardElem.querySelector(".badge_card_set_title").textContent.replace(cardElem.querySelector(".badge_card_set_text_qty")?.textContent, "").trim();

					let html = `<a class="market_link open_market_page" href="https://steamcommunity.com/market/listings/753/${hashName}" target="_blank">打开市场页面</a>
								<a class="market_link show_market_info" data-market-hash-name="${hashName}" style="margin-top: 5px;">查看市场价格</a>`;
					
					cardElem.lastElementChild.innerHTML = html;
					cardElem.lastElementChild.onclick = showMarketPriceTable;

					cardAssets1.push({
						appid: 753,
						icon: icon,
						market_name: title1,
						market_hash_name: decodeURIComponent(hashName)
					});
				}
				
				var multiBuyOrder = document.querySelector(".badge_detail_tasks>.gamecards_inventorylink #multi_buy_order");
				multiBuyOrder.style.display = null;
				multiBuyOrder.onclick = function() {
					dialogMultiCreateBuyOrder(cardAssets1, currencyInfo);
				}
			}
			
			var response = await searchMarketGameItems(gameid, 2, cardborder);
			if (response.success && response.results.length == 0) {
				var response = await searchMarketGameItems(gameid, 2, cardborder);
			}
			if (response.success) {
				let cardAssets = [];
				var results = response.results;
				for (let cardElem of cardElems) {
					let image = cardElem.querySelector("img.gamecard").src;
					let title = cardElem.querySelector(".badge_card_set_title").textContent.replace(cardElem.querySelector(".badge_card_set_text_qty")?.textContent, "").trim().replace(/\(集换式卡牌\)$/, "").replace(/\(Trading Card\)$/, "").trim();
					for (let card of results) {
						let cardTitle = card.name.replace(/\(集换式卡牌\)$/, "").replace(/\(Trading Card\)$/, "").trim();
						if (image.includes(card.asset_description.icon_url) || title == cardTitle) {
							cardAssets.push(card.asset_description);
							let hashName = card.asset_description.market_hash_name || card.hash_name;
							hashName = encodeURIComponent(hashName);
							let html = `<a class="market_link open_market_page" href="https://steamcommunity.com/market/listings/753/${hashName}" target="_blank">打开市场页面</a>
									    <a class="market_link show_market_info" data-market-hash-name="${hashName}" style="margin-top: 5px;">起价：${card.sell_price_text}</a>`;

							cardElem.lastElementChild.innerHTML = html;
							cardElem.lastElementChild.onclick = showMarketPriceTable;
							
							break;
						}
					}
				}

				var multiBuyOrder = document.querySelector(".badge_detail_tasks>.gamecards_inventorylink #multi_buy_order");
				multiBuyOrder.style.display = null;
				multiBuyOrder.onclick = function() {
					dialogMultiCreateBuyOrder(cardAssets, currencyInfo);
				}

				//显示市场价格信息
				if (globalSettings.gamecards_show_priceoverview) {
					getAllCardsPrice();
				}

			}
		}

		//添加显示该游戏的所有求购订单
		async function appendMyBuyOrders() {
			var myOrders = await getMyBuyOrders();
			if (myOrders && myOrders.length > 0) {
				var gameid = getGameId();
				var gameOrders = [];
				for (var order of myOrders) {
					if (order.appid == "753" && order.market_hash_name.startsWith(gameid + "-")) {
						gameOrders.push(order);
					}
				}

				if (gameOrders.length > 0) {
					var html = "";
					for (var order of gameOrders) {
						html += `<tr class="my_buy_order_row" data-market-hash-name="${order.market_hash_name}" data-buy-orderid="${order.buy_orderid}">
								 <td><div class="my_buy_order_name"><img src="${order.icon}"><span><a class="my_buy_order_item_name" href="${order.market_link}" target="_blank">${order.name}</a><br>
								 <span class="my_buy_order_game_name">${order.game_name}</span></span></div></td>
								 <td><div class="my_buy_order_cell">${order.quantity}</div></td><td><div class="my_buy_order_cell my_buy_order_price" data-market-hash-name="${order.market_hash_name}">${order.price}</div></td>
								 <td class="my_buy_order_action"><a class="my_buy_order_cancel" data-name="${order.name}" data-buy-orderid="${order.buy_orderid}">取消</a><input type="checkbox" class="my_buy_order_checkbox"></td></tr>`;
					}
					html = `<style>.my_buy_order_table {border-spacing: 0 5px; width: 920px; margin: 10px; } .my_buy_order_table thead td:not(:last-child) {border-right: 1px solid #404040;}
							.my_buy_order_table tr {background-color: #00000033;} .my_buy_order_table td {padding: 0 5px; height: 30px; font-size: 12px;} .my_buy_order_table thead td {text-align: center;}
							.my_buy_order_name {display: flex; align-items: center; width: 410px;} .my_buy_order_name img {width: 38px; height: 38px; margin: 5px; border: 1px solid #3A3A3A; background-color: #333333;}
							.my_buy_order_item_name, my_buy_order_game_name {overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: inherit;} 
							.my_buy_order_cell {width: 105px; color: white; text-align: center; overflow: hidden; white-space: nowrap;} .my_buy_order_item_name:hover {text-decoration: underline;}
							.my_buy_order_action {text-align: center; position: relative;} .my_buy_order_cancel {display: inline-block; line-height: 30px; width: 60px;} 
							.my_buy_order_cancel:hover, #my_buy_order_cancel_all:hover, #my_buy_order_update:hover, .my_buy_order_price:hover {background: #7bb7e355;} 
							.my_buy_order_checkbox {position: absolute; top: 15px; right: 20px; cursor: pointer; transform: scale(1.5);}  
							#my_buy_order_action_all {position: relative;} #my_buy_order_cancel_all {display: inline-block; line-height: 24px; width: 80px;} .my_buy_order_price {line-height: 30px; cursor: pointer;}
							#my_buy_order_select_btn {position: absolute; top: 0; right: 20px; line-height: 30px;} #my_buy_order_select_all {cursor: pointer; transform: scale(1.5) translateY(2px);} 
							#my_buy_order_select_btn label {cursor: pointer; color: white; padding-right: 4px;} .my_buy_order_item_name {font-size: 14px; font-weight: bold;}
							#my_buy_order_update {position: absolute; top: 3px; left: 10px; line-height: 24px; width: 60px;}</style>
							<div class="my_buy_order_section">
							<table class="my_buy_order_table"><colgroup><col style="width: 0;"><col style="width: 0;"><col style="width: 0;"><col style="width: 100%;"></colgroup>
							<thead><tr><td style="position: relative;"><a id="my_buy_order_update">更新</a>名称</td><td>数量</td><td>价格</td><td id="my_buy_order_action_all"><a id="my_buy_order_cancel_all">取消求购</a>
							<div id="my_buy_order_select_btn"><label for="my_buy_order_select_all">全选</label><input id="my_buy_order_select_all" type="checkbox"></div></td></tr></thead><tbody>${html}</tbody></table>
							</div>`

					var container = document.createElement("div");
					container.innerHTML = html;
					document.querySelector(".badge_card_set_cards").parentNode.appendChild(container);

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

					container.querySelector("#my_buy_order_update").onclick = event => {
						container.parentNode.removeChild(container);
						appendMyBuyOrders();
					}
				}
			}
		}

		async function getAllCardsPrice() {
			var elems = document.querySelectorAll(".show_market_info");
			for (let el of elems) {
				var hashName = el.getAttribute("data-market-hash-name");
				var data = await getCurrentItemOrdersHistogram(currencyInfo.country, currencyInfo.eCurrencyCode, 753, hashName);
				if (data) {
					showPirceUnderCard(hashName, data);
					dialogPriceInfo.checkUpdateItemOrdersHistogram(753, hashName, data, currencyInfo);
				}
			}
		}

		function showMarketPriceTable(event) {
			var elem = event.target;
			if (elem.classList.contains("show_market_info")) {
				var marketHashName = elem.getAttribute("data-market-hash-name");
				dialogPriceInfo.show(753, marketHashName, currencyInfo, function(data) {
					showPirceUnderCard(marketHashName, data);
				});
			}
		}

		function showPirceUnderCard(hashName, data1) {
			if (data1) {
				var elem2 = document.querySelector(`.show_market_info[data-market-hash-name="${hashName}"]`);
				if (elem2) {  //在卡牌下方显示最低出售价和最高求购价
					if (data1.success) {
						var html2 = data1.sell_order_graph.length > 0 ? (currencyInfo.bSymbolIsPrefix ? `${currencyInfo.strSymbol} ${data1.sell_order_graph[0][0].toFixed(2)}` : `${data1.sell_order_graph[0][0].toFixed(2)} ${currencyInfo.strSymbol}`) : "无";
						html2 += data1.buy_order_graph.length > 0 ? (currencyInfo.bSymbolIsPrefix ? ` | ${currencyInfo.strSymbol} ${data1.buy_order_graph[0][0].toFixed(2)}` : ` | ${data1.buy_order_graph[0][0].toFixed(2)} ${currencyInfo.strSymbol}`) : " | 无";
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
			var res = await cancelBuyOrder(buyOrderId, unsafeWindow.g_sessionID);
			if (res.success == 1) {
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
			var html = `<style>#market_info_group {display: flex; margin: 0px auto;} #market_info_group>div:first-child {margin-right: 20px;} #market_info_group>div {border: 1px solid #000000;} 
						#market_info_group .table_action_button, #market_info_group th, #market_info_group td {text-align: center; font-size: 14px;} 
						#market_info_group th, #market_info_group td {min-width: 100px; background: transparent; width: auto; line-height: normal;} 
						#card_price_overview>span {margin-right: 30px;} #market_info_group .market_commodity_orders_table {margin: 0px auto;} 
						#market_info_group .market_commodity_orders_table tr:nth-child(even) {background: #00000033;} #market_info_group .market_commodity_orders_table tr:nth-child(odd) {background: #00000066;}
						.orders_price_receive {font-size: 80%; color: #7f7f7f;} #card_price_overview {margin: 0 30px 15px 0; text-wrap: nowrap;} .market_listings_table {min-width: 208px; min-height: 192px;}
						#update_button {float: right; cursor: pointer; padding: 0px 5px; background: #404040;} #update_button:hover {background: #464646;} 
						.table_action_button>a, #create_buy_order_purchase {width: 80px; text-align: center; display: inline-block; margin: 3px 0px; background: #588a1b; box-shadow: 1px 1px 1px #00000099; border-radius: 2px;} 
						.table_action_button>a:hover, #create_buy_order_purchase:hover {background: #79b92b;} #create_buy_order_purchase[disabled="disabled"] {pointer-events: none; background: #4b4b4b; box-shadow: none; color: #bdbdbd;}
						.create_buy_order_container {margin-top: 15px;} .create_buy_order_inline {display: inline-block;} .create_buy_order_cell {position: relative;}
						#create_buy_order_price {width: 100px; color: #acb2b8;} #create_buy_order_quantity{width: 50px; color: #acb2b8;} #create_buy_order_total {width: 100px; text-wrap: nowrap;}
						#create_buy_order_second_price, #create_buy_order_second_total {position: absolute; font-size: 80%; color: #888888; width: 100px; text-wrap: nowrap;}</style>
						<div style="min-height: 230px;" id="dialog_price_info">
						<div id="update_button">更新</div><div id="card_price_overview">Loading...</div><div style="clear: both;"></div>
						<div id="market_info_group">
						<div class="sell_order_table market_listings_table"><div class="table_action_button"><a id="market_buy_button">购买</a></div><div class="table_content"></div></div>
						<div class="buy_order_table market_listings_table"><div class="table_action_button"><a id="market_buy_order_button">求购</a></div><div class="table_content"></div></div></div>
						<div class="create_buy_order_container" style="display: none;">
						<div class="create_buy_order_inline">单价:</div>
						<div class="create_buy_order_inline create_buy_order_cell"><input id="create_buy_order_price" type="number" step="0.01" min="0.03"><div id="create_buy_order_second_price"></div></div>
						<div class="create_buy_order_inline" style="margin-left: 15px;">数量:</div>
						<div class="create_buy_order_inline"><input id="create_buy_order_quantity" type="number" step="1" min="1"></div>
						<div class="create_buy_order_inline" style="margin-left: 15px;">总价:</div>
						<div class="create_buy_order_inline create_buy_order_cell"><div id="create_buy_order_total">--</div><div id="create_buy_order_second_total"></div></div>
						<div class="create_buy_order_inline"><a id="create_buy_order_purchase" style="position: relative; z-index: 9;">提交订单</a></div>
						<div id="create_buy_order_message" style="margin-top: 15px; color: #FFFFFF; width: 490px;"></div>
						</div></div>`;
			this.cmodel = ShowDialogBetter(decodeURIComponent(marketHashName), html);
			this.model = this.cmodel.GetContent()[0];

			this.appid = appid;
			this.marketHashName = marketHashName;
			this.currencyInfo = currencyInfo;
			this.histogram = null;

			this.model.querySelector("#market_buy_button").onclick = event => this.showCreateBuyOrder(event);
			this.model.querySelector("#market_buy_order_button").onclick = event => this.showCreateBuyOrder(event);

			this.model.querySelector("#create_buy_order_price").oninput = event => this.updatePriceTotal();
			this.model.querySelector("#create_buy_order_quantity").oninput = event => this.updatePriceTotal();

			this.model.querySelector("#create_buy_order_purchase").onclick = event => this.buyOrderPurchase(event);
		},
		show: function(appid, marketHashName, currencyInfo, func1, func2) {
			this.init(appid, marketHashName, currencyInfo);

			this.model.querySelector("#update_button").onclick = event => {
				var key = appid + "/" + marketHashName;
				delete itemPriceOverviewInfo[key];
				delete itemPriceGramInfo[key];
				this.showCurrentItemOrdersHistogram(appid, marketHashName, currencyInfo, func1);
				this.showCurrentPriceOverview(appid, marketHashName, currencyInfo, func2);
			};

			this.showCurrentItemOrdersHistogram(appid, marketHashName, currencyInfo, func1);
			this.showCurrentPriceOverview(appid, marketHashName, currencyInfo, func2);
		},
		showTable: function(appid, marketHashName, data, currencyInfo) {
			this.init(appid, marketHashName, currencyInfo);
			this.model.querySelector("#card_price_overview").style.display = "none";
			this.model.querySelector("#update_button").style.display = "none";
			this.updateItemOrdersHistogram(data, currencyInfo);
		},
		showCurrentItemOrdersHistogram: async function(appid, hashName, currencyInfo, func) {
			var data = await getCurrentItemOrdersHistogram(currencyInfo.country, currencyInfo.eCurrencyCode, appid, hashName);
			if (data) {
				this.checkUpdateItemOrdersHistogram(appid, hashName, data, currencyInfo);
				if (typeof func === "function") {
					func(data);
				}
			}
		},
		checkUpdateItemOrdersHistogram: function(appid, hashName, data, currencyInfo) {
			if  (appid == this.appid && hashName == this.marketHashName) {
				this.updateItemOrdersHistogram(data, currencyInfo);
			}
		},
		updateItemOrdersHistogram: function(data, currencyInfo) {
			if (this.model) {
				var elem1 = this.model.querySelector("#market_info_group");
				if (elem1) {  //在弹出窗口上显示表格
					if (data.success) {
						this.histogram = data;
						elem1.querySelector(".sell_order_table .table_content").innerHTML = data.sell_order_table || data.sell_order_summary;
						elem1.querySelector(".buy_order_table .table_content").innerHTML = data.buy_order_table || data.buy_order_summary;
					} else {
						elem1.querySelector(".sell_order_table .table_content").innerHTML = `${errorTranslator(data)}`
					}
					if (currencyInfo.strCode == globalCurrencyRate.wallet_code && currencyInfo.strCode != globalCurrencyRate.second_code) {
						var currencyInfo2 = getCurrencyInfo(globalCurrencyRate.second_code, true);
						if (data.sell_order_table) {
							var rows = elem1.querySelectorAll(".sell_order_table tr");
							var th = document.createElement("th");
							th.textContent = rows[0].firstElementChild.textContent + "-2";
							rows[0].insertBefore(th, rows[0].lastElementChild);
							for (var i = 1; i < rows.length; i++) {
								var text = rows[i].firstElementChild.textContent;
								var pay = getPriceFromSymbolStr(text);
								var price = calculatePriceYouReceive(pay);
								var [pay2, price2] = calculateSecondPrice(price);
								rows[i].firstElementChild.innerHTML = `<div class="orders_price_pay">${text}</div><div class="orders_price_receive">(${(data.price_prefix + " " + (price / 100.0).toFixed(2) + " " + data.price_suffix).trim()})</div>`;
								var td = document.createElement("td");
								if (currencyInfo2.bSymbolIsPrefix) {
									td.innerHTML = `<div class="orders_price_pay">${currencyInfo2.strSymbol} ${(pay2 / 100.0).toFixed(2)}</div><div class="orders_price_receive">(${currencyInfo2.strSymbol} ${(price2 / 100.0).toFixed(2)})</div>`;
								} else {
									td.innerHTML = `<div class="orders_price_pay">${(pay2 / 100.0).toFixed(2)} ${currencyInfo2.strSymbol}</div><div class="orders_price_receive">(${(price2 / 100.0).toFixed(2)} ${currencyInfo2.strSymbol})</div>`;
								}
								rows[i].insertBefore(td, rows[i].lastElementChild);
							}
						}
						if (data.buy_order_table) {
							var rows = elem1.querySelectorAll(".buy_order_table tr");
							var th = document.createElement("th");
							th.textContent = rows[0].firstElementChild.textContent + "-2";
							rows[0].insertBefore(th, rows[0].lastElementChild);
							for (var i = 1; i < rows.length; i++) {
								var text = rows[i].firstElementChild.textContent;
								var pay = getPriceFromSymbolStr(text);
								var price = calculatePriceYouReceive(pay);
								var [pay2, price2] = calculateSecondBuyPrice(price);
								rows[i].firstElementChild.innerHTML = `<div class="orders_price_pay">${text}</div><div class="orders_price_receive">(${(data.price_prefix + " " + (price / 100.0).toFixed(2) + " " + data.price_suffix).trim()})</div>`;
								var td = document.createElement("td");
								if (currencyInfo2.bSymbolIsPrefix) {
									td.innerHTML = `<div class="orders_price_pay">${currencyInfo2.strSymbol} ${(pay2 / 100.0).toFixed(2)}</div><div class="orders_price_receive">(${currencyInfo2.strSymbol} ${(price2 / 100.0).toFixed(2)})</div>`;
								} else {
									td.innerHTML = `<div class="orders_price_pay">${(pay2 / 100.0).toFixed(2)} ${currencyInfo2.strSymbol}</div><div class="orders_price_receive">(${(price2 / 100.0).toFixed(2)} ${currencyInfo2.strSymbol})</div>`;
								}
								rows[i].insertBefore(td, rows[i].lastElementChild);
							}
						}
					}
				}
				this.cmodel.AdjustSizing();
			}
		},
		showCurrentPriceOverview: async function(appid, hashName, currencyInfo, func) {
			var data = await getCurrentPriceOverview(currencyInfo.country, currencyInfo.eCurrencyCode, appid, hashName);
			if (data) {
				this.checkUpdatePriceOverview(appid, hashName, data);
				if (typeof func === "function") {
					func(data);
				}
			}
		},
		checkUpdatePriceOverview: function(appid, hashName, data) {
			if (appid == this.appid && hashName == this.marketHashName) { 
				this.updatePriceOverview(data);
			}
		},
		updatePriceOverview: function(data) {
			if (this.model) {
				var elem = this.model.querySelector("#card_price_overview");
				if (elem) {
					if (data.success) {
						var html2 = "";
						html2 += data.lowest_price ? `<span>最低售价：${data.lowest_price}</span>` : "";
						html2 += data.volume ? `<span>24h销量：${data.volume} 个</span>` : "";
						html2 += data.median_price ? `<span>24h售价：${data.median_price}</span>` : "";
					} else {
						var html2 = `<span>${errorTranslator(data)}</span>`;
					}
					elem.innerHTML = html2;	
				}
				this.cmodel.AdjustSizing();
			}
		},
		showCreateBuyOrder: function(event) {
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

			this.model.querySelector(".create_buy_order_container").style.display = null;
			this.model.querySelector("#create_buy_order_message").textContent = "";
			this.cmodel.AdjustSizing();
		},
		updatePriceTotal: function() {
			var amount = this.calculatePriceTotal();
			if (amount.price_total > 0 && amount.quantity > 0) {
				var total = (amount.price_total / 100.0).toFixed(2).replace(".", this.currencyInfo.strDecimalSymbol);
				this.model.querySelector("#create_buy_order_total").textContent = this.currencyInfo.bSymbolIsPrefix ? `${this.currencyInfo.strSymbol} ${total}`: `${total} ${this.currencyInfo.strSymbol}`;
			} else {
				this.model.querySelector("#create_buy_order_total").textContent = "--";
			}

			var currencyInfo2 = getCurrencyInfo(globalCurrencyRate.second_code, true);
			var price2 = (amount.price_2 / 100.0).toFixed(2).replace(".", currencyInfo2.strDecimalSymbol);
			price2 = currencyInfo2.bSymbolIsPrefix ? `(${currencyInfo2.strSymbol} ${price2})`: `(${price2} ${currencyInfo2.strSymbol})`;
			var total2 = (amount.price_total_2 / 100.0).toFixed(2).replace(".", currencyInfo2.strDecimalSymbol);
			total2 = currencyInfo2.bSymbolIsPrefix ? `(${currencyInfo2.strSymbol} ${total2})`: `(${total2} ${currencyInfo2.strSymbol})`;
			
			this.model.querySelector("#create_buy_order_second_price").textContent = amount.price_2 > 0 ? price2 : "";
			this.model.querySelector("#create_buy_order_second_total").textContent = amount.price_total_2 > 0 ? total2 : "";
		},
		calculatePriceTotal: function() {
			var price = Math.round(Number(this.model.querySelector("#create_buy_order_price").value) * 100);
			var quantity = parseInt(this.model.querySelector("#create_buy_order_quantity").value);
			var price2 = 0;
			if (this.currencyInfo.strCode == globalCurrencyRate.wallet_code && this.currencyInfo.strCode != globalCurrencyRate.second_code) {
				var price2 = calculateSecondBuyPrice(calculatePriceYouReceive(price))[0];
			}
			return {price: price, quantity: quantity, price_total: price * quantity, price_2: price2, price_total_2: price2 * quantity};
		},
		buyOrderPurchase: async function(event) {
			event.target.setAttribute("disabled", "disabled");
			var amount = this.calculatePriceTotal();
			if (amount.price_total > 0 && amount.quantity > 0) {
				var result = await createBuyOrder(unsafeWindow.g_sessionID, this.currencyInfo.eCurrencyCode, this.appid, this.marketHashName, amount.price_total, amount.quantity);
				if (result.success == "1") {
					this.model.querySelector("#create_buy_order_message").textContent = "您已成功提交订购单！";
				} else if (result.message) {
					this.model.querySelector("#create_buy_order_message").textContent = result.message;
				} else {
					this.model.querySelector("#create_buy_order_message").textContent = "抱歉！我们无法从 Steam 服务器获得关于您订单的信息。请再次检查您的订单是否确已创建或填写。如没有，请稍后再试。";
				}
			}
			event.target.setAttribute("disabled", "");
		}
	};

	//创建订购单的弹窗
	function dialogCreateBuyOrder(appid, marketHashName, currencyInfo) {
		var html = `<style>.buy_order_row {font-size: 14px; margin-bottom: 12px;} #buy_order_price_total {color: #FFFFFF; font-size: 16px;}
					#buy_order_purchase {float: right; background: #588a1b; box-shadow: 2px 2px 2px #00000099; border-radius: 2px; padding: 2px 10px; cursor: pointer; color: #FFFFFF;}
					#buy_order_purchase:hover {background: #79b92b;} #buy_order_message {margin-top: 12px; color: #FFFFFF; max-width: 430px;}
					#buy_order_purchase[disabled="disabled"] {pointer-events: none; background: #4b4b4b; box-shadow: none; color: #bdbdbd;}</style>
					<div><div class="buy_order_row"><span>每件出价的金额：</span><input id="buy_order_price" type="number" step="0.01" min="0.03"></div>
					<div class="buy_order_row"><span>想要购买的数量：</span><input id="buy_order_quantity" type="number" step="1" min="1"></div>
					<div class="buy_order_row"><span>订购单的总价：</span><span id="buy_order_price_total"><span></div>
					<div id="buy_order_purchase">提交订单</div><div style="clear:both;"></div>
					<div id="buy_order_message" style="display: none;"></div></div>`;
		var cmodel = ShowDialogBetter("购买 " + decodeURIComponent(marketHashName), html);
		var model = cmodel.GetContent()[0];

		model.querySelector("#buy_order_price").oninput = updatePriceTotal;
		model.querySelector("#buy_order_quantity").oninput = updatePriceTotal;
		model.querySelector("#buy_order_purchase").onclick = async function(event) {
			var button = event.target;
			button.setAttribute("disabled", "disabled");
			var amount = calculatePriceTotal();
			if (amount.price_total > 0 && amount.quantity > 0) {
				var result = await createBuyOrder(unsafeWindow.g_sessionID, currencyInfo.eCurrencyCode, appid, marketHashName, amount.price_total, amount.quantity);
				if (result.success == "1") {
					model.querySelector("#buy_order_message").textContent = "您已成功提交订购单！";
				} else if (result.message) {
					model.querySelector("#buy_order_message").textContent = result.message;
				} else {
					model.querySelector("#buy_order_message").textContent = "抱歉！我们无法从 Steam 服务器获得关于您订单的信息。请再次检查您的订单是否确已创建或填写。如没有，请稍后再试。";
				}
				model.querySelector("#buy_order_message").style.display = null;
			}
			button.setAttribute("disabled", "");
		}

		function updatePriceTotal() {
			var amount = calculatePriceTotal();
			if (amount.price_total > 0 && amount.quantity > 0) {
				var total = (amount.price_total / 100.0).toFixed(2).replace(".", currencyInfo.strDecimalSymbol);
				model.querySelector("#buy_order_price_total").textContent = currencyInfo.bSymbolIsPrefix ? `${currencyInfo.strSymbol} ${total}`: `${total} ${currencyInfo.strSymbol}`;
			} else {
				model.querySelector("#buy_order_price_total").textContent = "--";
			}
		}

		function calculatePriceTotal() {
			var price = Math.round(Number(model.querySelector("#buy_order_price").value) * 100);
			var quantity = parseInt(model.querySelector("#buy_order_quantity").value);
			return {quantity: quantity, price_total: price * quantity};
		}
	}

	//批量创建订购单的弹窗
	function dialogMultiCreateBuyOrder(assets, currencyInfo) {
		var html = "";
		for (var asset of assets) {
			html += `<tr class="multi_order_row" data-hash-name="${encodeURIComponent(asset.market_hash_name)}" data-appid="${asset.appid}">
					 <td><div class="multi_order_name multi_order_cell"><img class="multi_order_item_img" src="${(asset.icon || "https://community.cloudflare.steamstatic.com/economy/image/" + asset.icon_url) + "/48fx48f"}">
					 <a class="multi_order_name_link" href="https://steamcommunity.com/market/listings/${asset.appid}/${encodeURIComponent(asset.market_hash_name)}" target="_blank">${asset.market_name || asset.name}</a></div></td>
					 <td><div class="multi_order_cell"><input class="multi_order_price" type="number" step="0.01" min="0.03"><div class="multi_order_second_price multi_order_second"></div></div></td>
					 <td><div class="multi_order_cell"><input class="multi_order_quantity" type="number" step="1" min="0"></div></td>
					 <td><div class="multi_order_cell"><div class="multi_order_total" data-price-total="0">--</div><div class="multi_order_second_total multi_order_second" data-price-total="0"></div></div></td>
					 <td><div class="multi_order_status multi_order_cell"><span class="multi_order_success" style="display: none;">✔️</span><span class="multi_order_warning" style="display: none;">⚠️</span></div></td></tr>`;
		}
		html = `<style>.multi_order_table {border-spacing: 0 5px; margin-bottom: 10px; width: 855px;} .multi_order_cell {position: relative; width: 100%; display: inline-block; line-height: normal;}
				.multi_order_table td {padding: 0 5px; box-sizing: border-box; display: inline-block;} .multi_order_item_img {width: 48px; height: 48px; margin-right: 5px; cursor: pointer;}
				.multi_order_table td:nth-child(1) {width: 430px;} .multi_order_table td:nth-child(2) {width: 156px;} .multi_order_table td:nth-child(3) {width: 76px;} .multi_order_table td:nth-child(4) {width: 136px;} .multi_order_table td:nth-child(5) {width: 42px;}
				.multi_order_table tr {background-color: #00000033;} .multi_order_table thead td {height: 30px; line-height: 30px;} .multi_order_table tbody td {height: 58px; line-height: 58px;} 
				.multi_order_cell input {box-sizing: border-box; width: 100%; color: #acb2b8;} .multi_order_name {display: flex; align-items: center; margin: 5px 0px; overflow: hidden; text-wrap: nowrap;}
				#multi_order_purchase {float: right;  background: #588a1b; box-shadow: 1px 1px 1px #00000099; border-radius: 2px; padding: 2px 10px; width: 80px; text-align: center; cursor: pointer; color: #FFFFFF;}
				#multi_order_purchase:hover {background: #79b92b;} .multi_order_total {font-size: 13px; text-wrap: nowrap;} .multi_order_status {text-align: center;} .multi_order_name_link:hover {text-decoration: underline;}
				.multi_order_status span {cursor: default; position: relative; z-index: 9;} .multi_order_second {position: absolute; font-size: 12px; color: #888888; text-wrap: nowrap;}
				#multi_order_purchase[disabled="disabled"] {pointer-events: none; background: #4b4b4b; box-shadow: none; color: #bdbdbd;} .multi_order_name_link {overflow: hidden; text-overflow: ellipsis; font-weight: bold; color: inherit;}
				#multi_order_all_price {text-wrap: nowrap;} .multi_order_table tbody {display: inline-block; overflow-x: hidden; overflow-y: auto; min-height: 130px;}</style>
				<table class="multi_order_table">
				<thead style="display: inline-block;"><tr><td style="border-right: 1px solid #404040;">物品名称</td><td style="border-right: 1px solid #404040;">价格</td><td style="border-right: 1px solid #404040;">数量</td><td style="width: 178px;">总价</td></tr></thead>
				<tbody>${html}</tbody></table>
				<div style="width: 840px;"><div id="multi_order_purchase">提交订单</div><div style="white-space: nowrap;"><span>订购单的总价：</span><div class="multi_order_cell" style="width: auto;"><div id="multi_order_all_price">--</div>
				<div class="multi_order_all_price_second multi_order_second" style="font-size: 13px;"></div></div></div><div style="clear:both;"></div></div>`;

		var cmodel = ShowDialogBetter("购买多种物品", html);
		var model = cmodel.GetContent()[0];

		cmodel.OnResize(function(maxWidth, maxHeight) {
			model.querySelector("tbody").style.maxHeight = (maxHeight - 83) + "px";
		});

		var tableRows = model.querySelectorAll(".multi_order_row");
		for (let row of tableRows) {
			row.oninput = updatePriceTotal;
			row.onclick = function(event) {
				if (event.target.classList.contains("multi_order_item_img")) {
					dialogPriceInfo.show(row.getAttribute("data-appid"), row.getAttribute("data-hash-name"), currencyInfo);
				}
			};
		}

		model.querySelector("#multi_order_purchase").onclick = async function(event) {
			var button = event.target;
			button.setAttribute("disabled", "disabled");
			button.textContent = "提交中...";
			var sessionid = unsafeWindow.g_sessionID;
			var currency = currencyInfo.eCurrencyCode;
			for(var elem of model.querySelectorAll(".multi_order_row")) {
				elem.querySelector(".multi_order_success").style.display = "none";
				elem.querySelector(".multi_order_warning").style.display = "none";
				var appid = elem.getAttribute("data-appid");
				var hashName = elem.getAttribute("data-hash-name");
				var amount = calculatePriceTotal(elem);
				if (amount.price_total > 0 && amount.quantity > 0) {
					var result = await createBuyOrder(sessionid, currency, appid, hashName, amount.price_total, amount.quantity);
					if (result.success == "1") {
						elem.querySelector(".multi_order_success").style.display = null;
						elem.querySelector(".multi_order_success").title = "您已成功提交订购单！";
					} else if (result.message) {
						elem.querySelector(".multi_order_warning").style.display = null;
						elem.querySelector(".multi_order_warning").title = result.message;
					} else {
						elem.querySelector(".multi_order_warning").style.display = null;
						elem.querySelector(".multi_order_warning").title = "抱歉！我们无法从 Steam 服务器获得关于您订单的信息。请再次检查您的订单是否确已创建或填写。如没有，请稍后再试。";
					}
				}
			}
			button.setAttribute("disabled", "");
			button.textContent = "提交订单";
		}

		function updatePriceTotal(event) {
			var elem = event.currentTarget;
			var amount = calculatePriceTotal(elem);
			if (amount.price_total > 0 && amount.quantity > 0) {
				elem.querySelector(".multi_order_total").setAttribute("data-price-total", amount.price_total);
				var total = (amount.price_total / 100.0).toFixed(2).replace(".", currencyInfo.strDecimalSymbol);
				elem.querySelector(".multi_order_total").textContent = currencyInfo.bSymbolIsPrefix ? `${currencyInfo.strSymbol} ${total}`: `${total} ${currencyInfo.strSymbol}`;
			} else {
				elem.querySelector(".multi_order_total").setAttribute("data-price-total", 0);
				elem.querySelector(".multi_order_total").textContent = "--";
			}

			var currencyInfo2 = getCurrencyInfo(globalCurrencyRate.second_code, true);
			var price2 = (amount.price_2 / 100.0).toFixed(2).replace(".", currencyInfo2.strDecimalSymbol);
			price2 = currencyInfo2.bSymbolIsPrefix ? `(${currencyInfo2.strSymbol} ${price2})`: `(${price2} ${currencyInfo2.strSymbol})`;
			var total2 = (amount.price_total_2 / 100.0).toFixed(2).replace(".", currencyInfo2.strDecimalSymbol);
			total2 = currencyInfo2.bSymbolIsPrefix ? `(${currencyInfo2.strSymbol} ${total2})`: `(${total2} ${currencyInfo2.strSymbol})`;
			
			elem.querySelector(".multi_order_second_price").textContent = amount.price_2 > 0 ? price2 : "";
			elem.querySelector(".multi_order_second_total").textContent = amount.price_total_2 > 0 ? total2 : "";
			elem.querySelector(".multi_order_second_total").setAttribute("data-price-total", amount.price_total_2 > 0 ? amount.price_total_2 : 0);

			var allPriceTotal = 0;
			var allPriceTotal2 = 0;
			for (var totalElem of model.querySelectorAll(".multi_order_total")) {
				allPriceTotal += parseInt(totalElem.getAttribute("data-price-total"));
			}
			for (var totalElem of model.querySelectorAll(".multi_order_second_total")) {
				allPriceTotal2 += parseInt(totalElem.getAttribute("data-price-total"));
			}

			allPriceTotal = (allPriceTotal / 100.0).toFixed(2).replace(".", currencyInfo.strDecimalSymbol);
			model.querySelector("#multi_order_all_price").textContent = currencyInfo.bSymbolIsPrefix ? `${currencyInfo.strSymbol} ${allPriceTotal}`: `${allPriceTotal} ${currencyInfo.strSymbol}`;

			var allTotal2 = (allPriceTotal2 / 100.0).toFixed(2).replace(".", currencyInfo2.strDecimalSymbol);
			model.querySelector(".multi_order_all_price_second").textContent = allPriceTotal2 > 0 ? (currencyInfo2.bSymbolIsPrefix ? `(${currencyInfo2.strSymbol} ${allTotal2})`: `(${allTotal2} ${currencyInfo2.strSymbol})`) : "";
		}

		function calculatePriceTotal(elem) {
			var price = Math.round(Number(elem.querySelector(".multi_order_price").value) * 100);
			var quantity = parseInt(elem.querySelector(".multi_order_quantity").value);
			var price2 = 0;
			if (currencyInfo.strCode == globalCurrencyRate.wallet_code && currencyInfo.strCode != globalCurrencyRate.second_code) {
				var price2 = calculateSecondBuyPrice(calculatePriceYouReceive(price))[0];
			} 
			
			return {price: price, quantity: quantity, price_total: price * quantity, price_2: price2, price_total_2: price2 * quantity};
		}
	}

	//添加商店设置
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
			var options = (`<style>.settings_container {user-select: none; width: 500px;} .settings_page_title {margin-bottom: 5px;} .settings_row {margin-left: 15px; margin-bottom: 10px;} .settings_row input[type="checkbox"], .settings_row label, .settings_select {cursor: pointer;}
							.margin_right_20 {margin-right: 20px;} .settings_option {display: inline-block; margin-bottom: 5px;} .settings_row input[type="checkbox"] {margin: 0 2px; vertical-align: middle;} .settings_select {color: #EBEBEB; background: #1F1F1F;} </style>
							<div class="settings_container">
							<div class="settings_page_title">商店搜索页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_search_click_picture" type="checkbox" onclick="window.sfu_settings.search_click_picture = this.checked;" ${settings.search_click_picture ? "checked=true" : ""}></input><label for="sfu_search_click_picture" class="margin_right_20">点击游戏图片打开徽章页面</label></div>
							<div class="settings_option"><input id="sfu_search_click_title" type="checkbox" onclick="window.sfu_settings.search_click_title = this.checked;" ${settings.search_click_title ? "checked=true" : ""}></input><label for="sfu_search_click_title" class="margin_right_20">点击游戏名时选中并复制</label></div>
							<div class="settings_option"><input id="sfu_search_click_price" type="checkbox" onclick="window.sfu_settings.search_click_price = this.checked;" ${settings.search_click_price ? "checked=true" : ""}></input><label for="sfu_search_click_price" class="margin_right_20">点击游戏价格时添加到购物车</label></div>
							<div class="settings_option"><input id="sfu_search_set_filter" type="checkbox" onclick="window.sfu_settings.search_set_filter = this.checked;" ${settings.search_set_filter ? "checked=true" : ""}></input><label for="sfu_search_set_filter">价格由低到高显示有卡牌的游戏</label></div>
							</div>
							<div class="settings_page_title">愿望单页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_wishlist_click_picture" type="checkbox" onclick="window.sfu_settings.wishlist_click_picture = this.checked;" ${settings.wishlist_click_picture ? "checked=true" : ""}></input><label for="sfu_wishlist_click_picture" class="margin_right_20">点击游戏图片打开徽章页面</label></div>
							<div class="settings_option"><input id="sfu_wishlist_click_title" type="checkbox" onclick="window.sfu_settings.wishlist_click_title = this.checked;" ${settings.wishlist_click_title ? "checked=true" : ""}></input><label for="sfu_wishlist_click_title" class="margin_right_20">点击游戏名时选中并复制</label></div>
							<div class="settings_option"><input id="sfu_wishlist_click_price" type="checkbox" onclick="window.sfu_settings.wishlist_click_price = this.checked;" ${settings.wishlist_click_price ? "checked=true" : ""}></input><label for="sfu_wishlist_click_price">点击游戏价格时打开商店页面</label></div>
							</div>
							<div class="settings_page_title">消费历史记录页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_history_append_filter" type="checkbox" onclick="window.sfu_settings.history_append_filter = this.checked;" ${settings.history_append_filter ? "checked=true" : ""}></input><label for="sfu_history_append_filter" class="margin_right_20">添加筛选栏和统计栏</label></div>
							<div class="settings_option"><input id="sfu_history_change_onclick" type="checkbox" onclick="window.sfu_settings.history_change_onclick = this.checked;" ${settings.history_change_onclick ? "checked=true" : ""}></input><label for="sfu_history_change_onclick">修改日期和物品的点击效果</label></div>
							<div class="settings_option"><span>货币：</span><select class="settings_select"; onchange="window.sfu_settings.history_currency_code = this.value;" title>${selectOptions}</select></div>
							</div>
							</div>`);
			unsafeWindow.ShowConfirmDialog("Steam功能和界面优化", options).done(function() {
				settings = unsafeWindow.sfu_settings;
				setStorageValue("SFU_STORE_SETTINGS", settings);
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

	//添加设置按键和设置页面
	function addSteamCommunitySetting() {
		var settingBtn = document.createElement("div");
		settingBtn.setAttribute("style", "position: absolute; background-color: #3b4b5f; right: 10px; top: 10px; border-radius: 2px; box-shadow: 0px 0px 2px 0px #00000099");
		settingBtn.innerHTML = "<a style='cursor: pointer; padding: 3px 15px; line-height: 24px; font-size: 12px; color: #b8b6b4;'>设置</a>";
		settingBtn.onclick = function() {
			var settings = getSteamCommunitySettings();
			var exchangeRate = readCurrencyRate();
			unsafeWindow.sfu_settings = settings;
			unsafeWindow.sfu_update_currency_rate = function() {
				getCurrencyRate(settings.currency_code, settings.second_currency_code, exchangeRate.listings_start);
			};
			var selectOptions = "";
			var selectOptions2 = "";
			for (var code in currencyData) {
				selectOptions += `<option value="${code}" ${code == settings.currency_code ? "selected='selected'": ""}>${code} ( ${currencyData[code].strSymbol} )</option>`;
				selectOptions2 += `<option value="${code}" ${code == settings.second_currency_code ? "selected='selected'": ""}>${code} ( ${currencyData[code].strSymbol} )</option>`;
			}
			var options = (`<style>.settings_container {user-select: none; width: 500px;} .settings_page_title {margin-bottom: 5px;} .settings_row {margin-left: 15px; margin-bottom: 10px;} 
							.settings_select, .settings_row input[type="checkbox"], .settings_row label, input[type="button"] {cursor: pointer;} .settings_select {color: #EBEBEB; background: #1F1F1F;} 
							.settings_row input[type="checkbox"] {vertical-align: middle; margin: 0 2px;} .settings_input_number {color: #EBEBEB; background: #1F1F1F; width: 60px; margin-left: 5px;} 
							.margin_right_20 {margin-right: 20px;} .settings_option {display: inline-block; margin-bottom: 5px;} 
							.settings_input_number::-webkit-outer-spin-button, .settings_input_number::-webkit-inner-spin-button {-webkit-appearance: none !important;}
							.settings_currency {display: inline-block;} .settings_currency > div:first-child {margin-bottom: 5px;}</style>
							<div class="settings_container">
							<div style="margin-bottom: 5px; display: flex; align-items: center;"><span>汇率更新间隔(min)：</span>
							<input class="settings_input_number" type="number" min="1" step="1" value="${settings.rate_update_interval}" oninput="window.sfu_settings.rate_update_interval = parseInt(this.value);">
							<input type="button" value="立即更新" style="margin-left: 5px; padding: 2px 7px; background: #555555;" class="btn_grey_steamui" onclick="window.sfu_update_currency_rate();">
							<span id="show_update_time" style="margin-left: 20px;">${new Date(exchangeRate.last_update).toLocaleString()}</span></div>
							<div style="margin-bottom: 10px; display: flex;">
							<div class="settings_currency" style="margin-right: 40px;">
							<div><span>钱包货币：</span><select class="settings_select"; onchange="window.sfu_settings.currency_code = this.value;" title="用于无法获取货币信息的页面，包括徽章页面和消费历史页面">${selectOptions}</select></div>
							<div id="show_wallet_rate">USD 1 = ${exchangeRate.wallet_code} ${exchangeRate.wallet_rate > 0? exchangeRate.wallet_rate: "??"}</div>
							<div>${exchangeRate.wallet_code} 1 = ${exchangeRate.second_code} ${exchangeRate.wallet_second_rate > 0? exchangeRate.wallet_second_rate: "??"}</div></div>
							<div class="settings_currency">
							<div><span>第二货币：</span><select class="settings_select"; onchange="window.sfu_settings.second_currency_code = this.value;" title="">${selectOptions2}</select></div>
							<div id="show_second_rate">USD 1 = ${exchangeRate.second_code} ${exchangeRate.second_rate > 0? exchangeRate.second_rate: "??"}</div>
							<div>${exchangeRate.second_code} 1 = ${exchangeRate.wallet_code} ${exchangeRate.wallet_second_rate > 0? (1.0 / exchangeRate.wallet_second_rate).toFixed(6): "??"}</div></div>
							</div>
							<div class="settings_page_title">库存页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_inventory_set_style" type="checkbox" ${settings.inventory_set_style ? "checked=true" : ""} onclick="window.sfu_settings.inventory_set_style = this.checked;"></input><label for="sfu_inventory_set_style" class="margin_right_20">修改页面布局</label></div>
							<div class="settings_option"><input id="sfu_inventory_set_filter" type="checkbox" ${settings.inventory_set_filter ? "checked=true" : ""} onclick="window.sfu_settings.inventory_set_filter = this.checked;"></input><label for="sfu_inventory_set_filter" class="margin_right_20">只显示普通卡牌</label></div>
							<div class="settings_option"><input id="sfu_inventory_append_linkbtn" type="checkbox" ${settings.inventory_append_linkbtn ? "checked=true" : ""} onclick="window.sfu_settings.inventory_append_linkbtn = this.checked;"></input><label for="sfu_inventory_append_linkbtn" class="margin_right_20">添加链接按键</label></div>
							<div class="settings_option"><input id="sfu_inventory_sell_btn" type="checkbox" ${settings.inventory_sell_btn ? "checked=true" : ""} onclick="window.sfu_settings.inventory_sell_btn = this.checked;"></input><label for="sfu_inventory_sell_btn" class="margin_right_20">添加出售按键</label></div>
							<div class="settings_option"><input id="sfu_inventory_market_info" type="checkbox" ${settings.inventory_market_info ? "checked=true" : ""} onclick="window.sfu_settings.inventory_market_info = this.checked;"></input><label for="sfu_inventory_market_info">自动显示市场价格信息</label></div>
							</div>
							<div class="settings_page_title">市场页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_market_adjust_selllistings" type="checkbox" ${settings.market_adjust_selllistings ? "checked=true" : ""} onclick="window.sfu_settings.market_adjust_selllistings = this.checked;"></input><label for="sfu_market_adjust_selllistings" class="margin_right_20">调整出售物品表格</label></div>
							<div class="settings_option"><input id="sfu_market_adjust_history" type="checkbox" ${settings.market_adjust_history ? "checked=true" : ""} onclick="window.sfu_settings.market_adjust_history = this.checked;"></input><label for="sfu_market_adjust_history" class="margin_right_20">调整市场历史记录表格</label></div>
							<div class="settings_option"><input id="sfu_market_show_priceinfo" type="checkbox" ${settings.market_show_priceinfo ? "checked=true" : ""} onclick="window.sfu_settings.market_show_priceinfo = this.checked;"></input><label for="sfu_market_show_priceinfo" class="margin_right_20">出售物品表格自动显示最低出售和最高求购</label></div>
							<div class="settings_option"><label for="sfu_market_page_size">出售物品表格每页物品数量</label><input class="settings_input_number" id="sfu_market_page_size" type="number" step="1" min="1" value="${settings.market_page_size}" oninput="window.sfu_settings.market_page_size = Math.max(parseInt(this.value), 10);"></input></div>
							</div>
							<div class="settings_page_title">市场物品页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_marketlisting_set_style" type="checkbox" ${settings.marketlisting_set_style ? "checked=true" : ""} onclick="window.sfu_settings.marketlisting_set_style = this.checked;"></input><label for="sfu_marketlisting_set_style" class="margin_right_20">修改页面布局</label></div>
							<div class="settings_option"><input id="sfu_marketlisting_show_priceoverview" type="checkbox" ${settings.marketlisting_show_priceoverview ? "checked=true" : ""} onclick="window.sfu_settings.marketlisting_show_priceoverview = this.checked;"></input><label for="sfu_marketlisting_show_priceoverview" class="margin_right_20">显示销售信息</label></div>
							<div class="settings_option"><input id="sfu_marketlisting_append_linkbtn" type="checkbox" ${settings.marketlisting_append_linkbtn ? "checked=true" : ""} onclick="window.sfu_settings.marketlisting_append_linkbtn = this.checked;"></input><label for="sfu_marketlisting_append_linkbtn">添加链接按键</label></div>
							</div>
							<div class="settings_page_title">徽章页面设置：</div>
							<div class="settings_row">
							<div class="settings_option"><input id="sfu_gamecards_set_style" type="checkbox" ${settings.gamecards_set_style ? "checked=true" : ""} onclick="window.sfu_settings.gamecards_set_style = this.checked;"></input><label for="sfu_gamecards_set_style" class="margin_right_20">修改页面布局</label></div>
							<div class="settings_option"><input id="sfu_gamecards_append_linkbtn" type="checkbox" ${settings.gamecards_append_linkbtn ? "checked=true" : ""} onclick="window.sfu_settings.gamecards_append_linkbtn = this.checked;"></input><label for="sfu_gamecards_append_linkbtn" class="margin_right_20">添加链接按键</label></div>
							<div class="settings_option"><input id="sfu_gamecards_show_priceoverview" type="checkbox" ${settings.gamecards_show_priceoverview ? "checked=true" : ""} onclick="window.sfu_settings.gamecards_show_priceoverview = this.checked;"></input><label for="sfu_gamecards_show_priceoverview">自动显示市场价格信息</label></div>
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
		data.currency_code ??= "CNY";
		data.second_currency_code ??= "USD";
		data.rate_update_interval ??= 360;
		data.inventory_set_style ??= true;
		data.inventory_set_filter ??= true;
		data.inventory_append_linkbtn ??= true;
		data.inventory_sell_btn ??= true;
		data.inventory_market_info ??= true;
		data.marketlisting_set_style ??= true;
		data.marketlisting_show_priceoverview ??= true;
		data.marketlisting_append_linkbtn ??= true;
		data.gamecards_set_style ??= true;
		data.gamecards_show_priceoverview ??= false;
		data.gamecards_append_linkbtn ??= true;
		data.market_adjust_selllistings ??= true;
		data.market_adjust_history ??= true;
		data.market_show_priceinfo ??= false;
		data.market_page_size ??= 100;
		data.market_page_size = Math.max(data.market_page_size, 10);
		return data;
	}

	//检查是否更新汇率
	function checkUpdateCurrencyRate(settings, currencyRate) {
		if (settings.currency_code != currencyRate.wallet_code || settings.second_currency_code != currencyRate.second_code || 
			currencyRate.wallet_rate <= 0 || currencyRate.second_rate <= 0 || (Date.now() - currencyRate.last_update) > settings.rate_update_interval * 60000) {
			getCurrencyRate(settings.currency_code, settings.second_currency_code, currencyRate.listings_start);
		}
	}

	//获取并计算汇率
	async function getCurrencyRate(wallet_code, second_code, start) {
		var flag = false;
		var wallet_currency = getCurrencyInfo(wallet_code, true);
		var second_currency = getCurrencyInfo(second_code, true);
		var data = await getMarketListings("570", "Auspicious%20Pauldron%20of%20the%20Chiseled%20Guard", start, 100, wallet_currency.country, "english", wallet_currency.eCurrencyCode);
		if (data.success && data.listinginfo["4524490729968947472"]) {
			await sleep(5000);
			var data2 = await getMarketListings("570", "Auspicious%20Pauldron%20of%20the%20Chiseled%20Guard", start, 100, second_currency.country, "english", second_currency.eCurrencyCode);
			if (data2.success && data2.listinginfo["4524490729968947472"]) {
				var rate = {
					listings_start: Math.max((data2.total_count - 50), 0),
					wallet_code: wallet_code,
					second_code: second_code,
					wallet_rate: (data.listinginfo["4524490729968947472"].converted_price / data.listinginfo["4524490729968947472"].price).toFixed(6),
					second_rate: (data2.listinginfo["4524490729968947472"].converted_price / data2.listinginfo["4524490729968947472"].price).toFixed(6),
					wallet_second_rate: (data2.listinginfo["4524490729968947472"].converted_price / data.listinginfo["4524490729968947472"].converted_price).toFixed(6),
					last_update: Date.now()
				};
				globalCurrencyRate = rate;
				saveCurrencyRate(rate);
				flag = true;
			}
		}
		if (!flag && data.success && data.total_count > 0) {
			globalCurrencyRate.listings_start = Math.max((data.total_count - 50), 0);
			saveCurrencyRate(globalCurrencyRate);
		}
	}

	//获取本地的汇率数据
	function readCurrencyRate() {
		var data = getStorageValue("SFU_CURRENCY_RATE") || {};
		data.listings_start = Math.max((data.listings_start ?? 40), 0);
		data.wallet_code ??= "??";
		data.second_code ??= "??";
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
							#SFU_pagecontrols { float: right; user-select: none; line-height: 22px; text-align: center; }
							.pagecontrol_pagelink { color: #ffffff; cursor: pointer; margin: 0 3px; }
							.pagecontrol_pagelink:hover { text-decoration: underline; }
							.pagecontrol_pagelink.active:hover { text-decoration: none; }
							.pagecontrol_pagelink.active { color: #747474; cursor: default; }`;
		document.body.appendChild(styleElem);

		var inventory_pagecontrols = document.querySelector('#inventory_pagecontrols');
		if (!inventory_pagecontrols) {
			return;
		}
		var pageControl = document.createElement('div');
		pageControl.id = 'SFU_pagecontrols';
		var html = `<a class="pagebtn" href="javascript:InventoryPreviousPage();"> < </a>
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
		
		var obs = new MutationObserver(function() {
			updatePageControl();
		});
		obs.observe(inventory_pagecontrols.querySelector('.pagecontrol_element.pagecounts'), { childList: true, subtree: true }); 

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

	function appendCartForm(subid, sessionid, snr, orgsnr) {
		try {
			subid = typeof subid === "string" ? subid : subid.toString();
			var form = document.createElement("form");
			form.name = "add_to_cart_" + subid;
			form.setAttribute("action", "https://store.steampowered.com/cart/");
			form.setAttribute("method", "POST");
			form.style.display = "none";
			form.innerHTML = `<input type="hidden" name="snr" value="${snr}"></input>
								<input type="hidden" name="originating_snr" value="${orgsnr}"></input>
								<input type="hidden" name="action" value="add_to_cart"></input>
								<input type="hidden" name="sessionid" value="${sessionid}"></input>
								<input type="hidden" name="subid" value="${subid}"></input>`;
			document.body.appendChild(form);
			return form;
		} catch (e) {
			console.log(e);
		}

	}

	//点击图片可打开徽章页面，点击物品名称下的游戏名可打开商店页面
	function addGameCardsLink(listing) {
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
			gameNameElem.innerHTML = `<a class="market_listing_game_name_link" href="${storeLink}" target="_blank" title="打开商店页面">${gameNameElem.innerHTML}</a>`;
			
			cardLinkElem.href = "https://steamcommunity.com/my/gamecards/" + gameid;
			cardLinkElem.setAttribute("title", "打开徽章页面");
		} else {
			var storeLink = "https://store.steampowered.com/app/" + appid;
			gameNameElem.innerHTML = `<a class="market_listing_game_name_link" href="${storeLink}" target="_blank" title="打开商店页面">${gameNameElem.innerHTML}</a>`;
		
			cardLinkElem.href = "https://steamcommunity.com/market/search?appid=" + appid;
			cardLinkElem.setAttribute("title", "打开市场搜索结果");
		}
	}

	function getMarketHashName(assetInfo) {
		var marketHashName = assetInfo.market_hash_name || assetInfo.market_name || assetInfo.name;
		return encodeURIComponent(marketHashName); 
	}

	function getPriceFromSymbolStr(str) {
		str = str.trim().replace('--', '00');
		str = str.replace(/(\D\.|\.\D)/g, '');
		if (str.indexOf('.') === -1 && str.indexOf(',') === -1) {
			str = str + ',00';
		}
		return parseInt(str.replace(/\D/g, ''));
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

	//根据汇率计算第二货币的价格
	function calculateSecondPrice(price, item) {
		if (price > 0) {
			var price2 = Math.max(Math.ceil(price * globalCurrencyRate.wallet_second_rate), 1);
			var pay2 = calculatePriceBuyerPay(price2, item);
			return [pay2, price2];
		} else {
			return [0, 0];
		}
	}

	function calculateSecondBuyPrice(price, item) {
		if (price > 0) {
			var price2 = Math.floor(price * globalCurrencyRate.wallet_second_rate);
			var pay2 = calculatePriceBuyerPay(price2, item);
			return [pay2, price2];
		} else {
			return [0, 0];
		}
	}

	var itemPriceGramInfo = {};
	async function getCurrentItemOrdersHistogram(country, currency, appid, hashName) {
		var key = appid + "/" + hashName;
		if (itemPriceGramInfo[key]) {
			if (itemPriceGramInfo[key].loaded) {
				return itemPriceGramInfo[key];
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
					itemPriceGramInfo[key] = data1;
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
	async function getCurrentPriceOverview(country, currency, appid, hashName) {
		var key = appid + "/" + hashName;
		if (itemPriceOverviewInfo[key]) {
			if (itemPriceOverviewInfo[key].loaded) {
				return itemPriceOverviewInfo[key];
			} else {
				return null;  //正在加载中，避免重复获取
			}
		} else {
			itemPriceOverviewInfo[key] = {};
			var data2 = await getPriceOverview(country, currency, appid, hashName);
			if (data2.success) {
				itemPriceOverviewInfo[key] = data2;
				itemPriceOverviewInfo[key].loaded = true;
			} else {
				delete itemPriceOverviewInfo[key];
			}
			return data2;
		}
	}

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

	async function cancelSelectedBuyOrder(rowsToCancel) {
		for (var row of rowsToCancel) {
			var btn = row.querySelector("a.item_market_action_button_edit");
			var buyOrderId = eval(btn.href.match(/CancelMarketBuyOrder\(([^\(\)]+)\)/)[1]);

			var data = await cancelBuyOrder(buyOrderId, unsafeWindow.g_sessionID);
			if (data.success == 1) {
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

	//获取所有求购订单
	function getMyBuyOrders() {
		return new Promise(function(resolve, reject) {
			var url = `https://steamcommunity.com/market/`;
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
			xhr.setRequestHeader("Cache-Control", "no-cache");
			xhr.responseType = "document";
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					var myOrders = [];
					var buyOrderSection;
					for (var section of e.target.response.querySelectorAll(".my_listing_section")) {
						if (section.querySelector(".market_listing_row")?.id?.match(/mybuyorder_\d+/)) {
							buyOrderSection = section;
							break;
						}
					}

					for (var row of (buyOrderSection ? buyOrderSection.querySelectorAll(".market_listing_row"): [])) {
						var icon = row.querySelector("img")?.src;  //可能没有图片
						var name = row.querySelector("a.market_listing_item_name_link").textContent.trim();
						var gameName = row.querySelector(".market_listing_game_name").textContent.trim();
						var marketLink = row.querySelector("a.market_listing_item_name_link").href;
						var appid = marketLink.match(/market\/listings\/(\d+)\//)[1];
						var hashName = marketLink.match(/market\/listings\/\d+\/([^\/]+)/)[1];
						var quantity = row.querySelector(".market_listing_buyorder_qty .market_listing_price").textContent.trim();
						var qty = row.querySelector(".market_listing_inline_buyorder_qty").textContent.trim();
						var price = row.querySelector(".market_listing_my_price:not(.market_listing_buyorder_qty) .market_listing_price").textContent.replace(qty, "").trim();
						var orderid = row.id.match(/^mybuyorder_(\d+)/)[1];

						myOrders.push({icon: icon, name: name, game_name: gameName, market_link: marketLink, appid: appid, market_hash_name: hashName, quantity: quantity, price: price, buy_orderid: orderid});
					} 

					resolve(myOrders);
				} else {
					console.log("getMyBuyOrders failed");
					resolve(null);
				}
			};
			xhr.onerror = function(error) {
				console.log("getMyBuyOrders error");
				resolve(null);
			};
			xhr.ontimeout = function() {
				console.log("getMyBuyOrders timeout");
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

	function getMarketListings(appid, hashName, start, count, country, language, currency) {
		return new Promise(function(resolve, reject) {
			var url = `https://steamcommunity.com/market/listings/${appid}/${hashName}/render/?query=&start=${start}&count=${count}&country=${country}&language=${language}&currency=${currency}`;
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

	function searchMarketGameItems(gameid, itemclass=-1, cardborder=-1, query="") {
		return new Promise(function (resolve, reject) {
			var url = `https://steamcommunity.com/market/search/render/?norender=1&query=${query}&start=0&count=100&search_descriptions=0&
					   sort_column=name&sort_dir=desc&appid=753&category_753_Event%5B%5D=any&category_753_Game%5B%5D=tag_app_${gameid}`;
			if (itemclass > -1) {
				url += `&category_753_item_class%5B%5D=tag_item_class_${itemclass}`;
			}
			if (cardborder > -1) {
				url += `&category_753_cardborder%5B%5D=tag_cardborder_${cardborder}`;
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
			"strSymbol": "pуб.",
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
		return 'Unknown';
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
	function getCurrencyInfo(code, set=false, defaultCode="CNY") {
		if (!set) {
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

	if (location.href.match(/^https?\:\/\/store\.steampowered\.com/)) {
		globalSettings = getStoreSettings();
	} else if (location.href.match(/^https?\:\/\/steamcommunity\.com/)) {
		globalSettings = getSteamCommunitySettings();
		globalCurrencyRate = readCurrencyRate();
		checkUpdateCurrencyRate(globalSettings, globalCurrencyRate);
	}

	steamStorePage();
	steamWishlistPage();
	steamAppStorePage();
	steamExplorePage();
	steamTradeOfferPage();
	steamInventoryPage();
	steamMarketListingPage();
	steamGameCardsPage();
	steamMarketPage();
	steamAccountHistory();
	steamWorkshopImageRepair();

})();

