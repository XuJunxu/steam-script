// ==UserScript==
// @name         Steam功能和界面优化
// @namespace    SteamFunctionAndUiOptimization
// @version      2.1.5
// @description  Steam功能和界面优化
// @author       Nin9
// @match        http*://store.steampowered.com/search*
// @match        http*://store.steampowered.com/wishlist*
// @match        http*://store.steampowered.com/app/*
// @match        http*://store.steampowered.com/explore/*
// @match        http*://steamcommunity.com/tradeoffer/*
// @match        http*://steamcommunity.com/id/*/inventory*
// @match        http*://steamcommunity.com/profiles/*/inventory*
// @match        http*://steamcommunity.com/market/*
// @match        http*://steamcommunity.com/id/*/gamecards/*
// @match        http*://steamcommunity.com/profiles/*/gamecards/*
// @match        http*://store.steampowered.com/account/history/*
// @match        http*://steamcommunity.com/sharedfiles/filedetails/*
// @match        http*://steamcommunity.com/workshop/filedetails/*
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

	//修复创意工坊预览大图无法显示的问题
	function steamWorkshopImageRepair() {
		if (location.href.search(/steamcommunity\.com\/(sharedfiles|workshop)\/filedetails/) < 0) {
			return;
		}

		if(typeof onYouTubeIframeAPIReady == 'function') {
			onYouTubeIframeAPIReady();
		}
	}

	//消费记录页面
	function steamAccountHistory() {
		if (location.href.search(/store\.steampowered\.com\/account\/history/) < 0) {
			return;
		}

		var settings = getStoreSettings();
		addStoreSettings();

		if (settings.history_append_filter || settings.history_change_onclick) {
			var loading = document.querySelector("#wallet_history_loading");
			var pageContent = document.querySelector(".page_header_ctn .page_content");
			pageContent.insertBefore(loading, pageContent.querySelector(".pageheader"));
			loading.style.float = "right";
			waitLoadingAllHistory();
		}

		if (settings.history_change_onclick) {
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
				var currencyInfo = getCurrencyInfo(settings.history_currency_code);
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

					if (settings.history_change_onclick && url) {
						var wht_date = row.querySelector("td.wht_date");
						wht_date.innerHTML = `<a href="${url}" target="_blank">${wht_date.innerHTML}</a>`;
					}
				}
				if (settings.history_append_filter) {
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
		if(location.href.search(/store\.steampowered\.com\/search/) < 0) {
			return;
		}

		var appid, title, price;
		var settings = getStoreSettings();
		addStoreSettings();

		if (settings.search_click_picture || settings.search_click_price || settings.search_click_title) {
			handleSearchResult();
		}
		
		//搜索结果排序和过滤
		if (settings.search_set_filter) {
			filterSearchResult();
		}

		function handleSearchResult() {
			if (settings.search_click_title) {
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
			if (settings.search_click_title && elem.classList.contains("title")) {  //点击游戏名时选中并自动复制
				event.preventDefault();
				document.execCommand("Copy"); 
			} else if (settings.search_click_picture && (elem.classList.contains("search_capsule") || elem.parentNode.classList.contains("search_capsule"))) {  //点击游戏图片时打开徽章页
				event.preventDefault();
				var aid = getAppid(elem, event.currentTarget, "search_result_row", "data-ds-appid");
				if (aid) {
					var url = `https://steamcommunity.com/my/gamecards/${aid}/`; 
					var win = window.open(url);
				}
			} else if (settings.search_click_price && (elem.classList.contains("search_discount_block") || elem.parentNode.classList.contains("search_discount_block") || elem.parentNode.parentNode.classList.contains("search_discount_block"))) {  //点击游戏价格时添加到购物车
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
		if(location.href.search(/store\.steampowered\.com\/wishlist/) < 0) {
			return;
		}

		var settings = getStoreSettings();
		addStoreSettings();

		if (settings.wishlist_click_picture || settings.wishlist_click_price || settings.wishlist_click_title) {
			handleWishlist();
		}

		function handleWishlist() {
			var styleElem = document.createElement("style");
			var html = "";
			if (settings.wishlist_click_title) {
				html += "a.title {user-select:all; cursor:text; }";
			}
			if (settings.wishlist_click_price) {
				html += "div.discount_prices{ cursor:pointer; }";
			}
			styleElem.innerHTML = html;
			document.body.appendChild(styleElem);
			document.querySelector("div#wishlist_ctn").addEventListener("click", wishlistClicked);
		}

		function wishlistClicked(event) {
			var elem = event.target;
			var aid = getAppid(elem, event.currentTarget, "wishlist_row", "data-app-id");
			if (settings.wishlist_click_title && elem.classList.contains("title")) {
				event.preventDefault();
				document.execCommand("Copy"); 
			} else if (settings.wishlist_click_price && (elem.classList.contains("discount_prices") || elem.parentNode.classList.contains("discount_prices"))) {
				window.open(`https://store.steampowered.com/app/${aid}/`);
			} else if (settings.wishlist_click_picture && elem.parentNode.classList.contains("screenshots")) {
				event.preventDefault();
				window.open(`https://steamcommunity.com/my/gamecards/${aid}/`);
			}
		}
	}

	//app页面
	function steamAppStorePage() {
		if(location.href.search(/store\.steampowered\.com\/app/) < 0) {
			return;
		}

		var elems = document.querySelectorAll("#category_block a");
		for (var el of elems) {
			if (el.href.search(/search\/\?category2\=29/) > 0) {
				var appid = location.href.match(/store\.steampowered\.com\/app\/(\d+)\//)[1];
				el.href = `https://steamcommunity.com/my/gamecards/${appid}/`;
				el.setAttribute("target", "_blank");
				break;
			}
		}
	}

	//探索队列界面
	function steamExplorePage() {
		if(location.href.search(/store\.steampowered\.com\/explore/) < 0) {
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
		if(location.href.search(/steamcommunity\.com\/tradeoffer/) < 0) {
			return;
		}

		appendPageControl();

		var div = document.createElement("div");
		div.id = "trade_offer_buttons";
		div.innerHTML = `<style>#trade_offer_buttons{margin: 10px 0px 0px 10px;} .btn_move_items{padding: 5px 15px;}</style>
						<a id="btn_add_cards" class="btn_move_items btn_green_white_innerfade">添加全部普通卡牌</a>
						<a id="btn_add_all" class="btn_move_items btn_green_white_innerfade">添加全部物品</a>
						<a id="btn_remove_all" class="btn_move_items btn_green_white_innerfade">移除全部物品</a>`;
		document.querySelector("#trade_yours .offerheader").appendChild(div);

		div.onclick = buttonClicked;
		
		function buttonClicked(event) {
			var button = event.target;
			if (button.id == "btn_add_cards") {
				addAllCommonCards()
			} else if (button.id == "btn_add_all") {
				addAllItems();
			} else if (button.id == "btn_remove_all") {
				removeAllItems();
			}
		};

		function addAllCommonCards() {
			var event = new Event("dblclick");
			var g_rgAppContextData = unsafeWindow.g_rgAppContextData;
			if (g_rgAppContextData && g_rgAppContextData[753] && g_rgAppContextData[753].rgContexts && 
				g_rgAppContextData[753].rgContexts[6] && g_rgAppContextData[753].rgContexts[6].inventory) {

				var rgItemElements = g_rgAppContextData[753].rgContexts[6].inventory.rgItemElements;
				for (var itemHolder of rgItemElements) {
					if (itemHolder && itemHolder.rgItem && itemHolder.rgItem.tradable && checkCommonCard(itemHolder.rgItem.tags)) {
						itemHolder.rgItem.element.dispatchEvent(event);
					}
				}
			}
		}

		function addAllItems() {
			var event = new Event("dblclick");
			var g_rgAppContextData = unsafeWindow.g_rgAppContextData;
			var g_ActiveInventory = unsafeWindow.g_ActiveInventory;
			var contextIds = g_ActiveInventory.rgContextIds ?? [g_ActiveInventory.contextid];
			for (var contextid of contextIds) {
				for (var itemHolder of g_rgAppContextData[g_ActiveInventory.appid].rgContexts[contextid].inventory.rgItemElements) {
					if (itemHolder?.rgItem?.tradable && (g_ActiveInventory.appid != "753" || itemHolder?.rgItem?.market_hash_name != "753-Gems") && itemHolder == itemHolder?.rgItem?.element?.parentNode) {
						itemHolder.rgItem.element.dispatchEvent(event);
					}
				}
			}
			
		}

		function removeAllItems() {
			var event = new Event("dblclick");
			var itemElements = document.querySelectorAll("#your_slots div.item");

			for (var element of itemElements) {
				element.dispatchEvent(event);
			}

			var waitId = setInterval(function() {
				if (document.querySelectorAll("#your_slots div.item").count > 0) {
					return;
				}

				clearInterval(waitId);

				for (var itemHolder of document.querySelectorAll("#trade_yours > div.trade_item_box > div.trade_slot")) {
					itemHolder.parentNode.removeChild(itemHolder);
				}

			}, 100);
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
		if(location.href.search(/steamcommunity\.com\/(id|profiles)\/.+\/inventory/) < 0) {
			return;
		}

		var settings = getSteamCommunitySettings();
		addSteamCommunitySetting();

		if (document.querySelector("#no_inventories")) {
			return;
		}

		var currencyInfo = getCurrencyInfo(settings.currency_code);
		var sellTotalPriceReceive = 0;
		var sellTotalPriceBuyerPay = 0;
		var sellCount = 0;

		var priceGramLoaded = false;
		var inventoryAppidForSell = 0;
		var inventoryAppidForLink = 0;

		//修改页面布局
		if (settings.inventory_set_style) {
			changeInventoryPage();
			appendPageControl();
		}

		//只显示普通卡牌
		if (settings.inventory_set_filter) {
			waitLoadInventory();
		}

		if (settings.inventory_append_linkbtn) {
			appendInventoryPageLinkBtn();
		}

		if (settings.inventory_sell_btn || settings.inventory_market_info) {
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
			styleElem.innerHTML = `.price_gram {display: flex; margin: 5px 10px;} .price_gram>div:first-child {margin-right: 5px;} .price_gram>div {border: 1px solid #000000;} 
									.table_title {text-align: center; font-size: 12px;} th, td {background: #00000066; width: 80px; text-align: center; font-size: 12px; line-height: 18px;} .price_overview {margin-left: 15px;} 
									.price_overview>span {margin-right: 20px;} .sell_price_input {text-align: center; margin-right: 2px; width: 80px;} .sell_btn_container {margin: 5px 10px;} 
									.quick_sell_btn {margin: 5px 5px 0px 0px;} .quick_sell_btn > span {padding: 0px 5px; pointer-events: none;} .price_receive {margin-left: 10px; font-size: 12px;}
									.show_market_info {border-radius: 2px; background: #000000; color: #FFFFFF; margin: 10px 0px 0px 10px; cursor: pointer; padding: 2px 15px; display: inline-block;} .show_market_info:hover {background: rgba(102, 192, 244, 0.4)}`;
			document.body.appendChild(styleElem);

			var html = `<div><a class="show_market_info">显示市场价格信息</a></div><div class="market_info"><div class="price_gram"></div><div class="price_overview"></div></div>
						<div class="sell_btn_container"><div><input class="sell_price_input" type="number" step="0.01" style="color: #FFFFFF; background: #000000; border: 1px solid #666666;">
						<a class="btn_small btn_green_white_innerfade sell_comfirm"><span>确认出售</span></a>
						<a class="btn_small btn_green_white_innerfade sell_all_same" title="出售全部相同的物品"><span>批量出售</span></a><br>
						<label class="price_receive" title="收到的金额"><label></div><div class="sell_btns"></div></div>`;
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

					if (settings.inventory_sell_btn && selectedItem.description.marketable) {
						document.querySelector("#price_gram_container0 .sell_price_input").oninput = event => showPriceReceive(event, selectedItem);
						document.querySelector("#price_gram_container1 .sell_price_input").oninput = event => showPriceReceive(event, selectedItem);
						document.querySelector("#price_gram_container0 .sell_comfirm").onclick = event => sellItemCustom(event, selectedItem);
						document.querySelector("#price_gram_container1 .sell_comfirm").onclick = event => sellItemCustom(event, selectedItem);
						document.querySelector("#price_gram_container0 .sell_all_same").onclick = event => sellAllSameItem(event, selectedItem);
						document.querySelector("#price_gram_container1 .sell_all_same").onclick = event => sellAllSameItem(event, selectedItem);
					} else {
						document.querySelector("#price_gram_container0 .sell_btn_container").style.display = "none";
						document.querySelector("#price_gram_container1 .sell_btn_container").style.display = "none";
					}

					if (settings.inventory_market_info) {
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
							#sell_log_total {font-weight: bold; margin-top: 5px} .price_gram, .price_gram div{font-size: 12px; font-weight: normal;} </style>
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
					var html1 = `<div><div class="table_title">出售</div>${data1.sell_order_table || data1.sell_order_summary}</div><div><div class="table_title">购买</div>${data1.buy_order_table || data1.buy_order_summary}</div>`;
					document.querySelector("#price_gram_container0 .price_gram").innerHTML = html1;
					document.querySelector("#price_gram_container1 .price_gram").innerHTML = html1;

					//添加快速出售按键
					if (settings.inventory_sell_btn && item.description.marketable) {
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
				
				if (settings.inventory_sell_btn && !priceGramLoaded && data.lowest_price && item.description.marketable) {
					document.querySelector("#price_gram_container0 .sell_price_input").value = (getPriceFromSymbolStr(data.lowest_price) / 100.0).toFixed(2);
					document.querySelector("#price_gram_container1 .sell_price_input").value = (getPriceFromSymbolStr(data.lowest_price) / 100.0).toFixed(2);
					document.querySelector("#price_gram_container0 .sell_price_input").dispatchEvent(new Event("input"));
					document.querySelector("#price_gram_container1 .sell_price_input").dispatchEvent(new Event("input"));
				}
			}
		}

		function showPriceReceive(event, item) {
			var elem = event.target;
			var label = elem.parentNode.querySelector(".price_receive");
			var amount = isNaN(parseFloat(elem.value)) ? 0 : Math.round(parseFloat(elem.value) * 100);
			var price = calculatePriceYouReceive(amount, item);
			if (currencyInfo.bSymbolIsPrefix) {
				label.innerHTML = currencyInfo.strSymbol + " " + (price / 100.0).toFixed(2);
			} else {
				label.innerHTML = (price / 100.0).toFixed(2) + " " + currencyInfo.strSymbol;
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
			var amount = isNaN(parseFloat(input.value)) ? 0 : Math.round(parseFloat(input.value) * 100);
			sellSelectedItem(amount, item);
		}

		//批量上架出售相同的物品
		async function sellAllSameItem(event, item) {
			var hashName = item.description.market_hash_name;
			var m_rgAssets = unsafeWindow.g_rgAppContextData[item.appid].rgContexts[parseInt(item.contextid)].inventory.m_rgAssets;
			if (hashName && m_rgAssets) {
				var input = event.currentTarget.parentNode.querySelector("input");
				var amount = isNaN(parseFloat(input.value)) ? 0 : Math.round(parseFloat(input.value) * 100);
				var price = calculatePriceYouReceive(amount, item);
				var buyerPay = calculatePriceBuyerPay(price, item);
				for (let assetid in m_rgAssets) {
					let it = m_rgAssets[assetid];
					if (it.description && it.description.marketable && it.description.market_hash_name == hashName) {
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
					var logText = `${sellCount} - ${item.description.name} 上架市场失败，原因：${data.message || errorTranslator(data)}` + "<br>";
					document.querySelector("#sell_log_text").innerHTML += logText;
				}
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
								<a class="btn_small btn_grey_white_innerfade" href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${feeApp}" target="_blank"><span>Exchange页面</span></a>`;
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
		if(location.href.search(/steamcommunity\.com\/market\//) < 0 || location.href.search(/steamcommunity\.com\/market\/listings\//) >= 0) {
			return;
		}
		var settings = getSteamCommunitySettings();
		addSteamCommunitySetting();

		var currencyInfo = getCurrencyInfo(settings.currency_code);
		var marketMyListings = {};
		var marketMyListingsPage = [];  //各页列表

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

		if (settings.market_adjust_selllistings || settings.market_adjust_history) {
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `.market_action_btn {padding: 0px 5px; margin-right: 8px; font-size: 12px;} 
								.control_action_container {padding-left: 6px; display: inline-block; position: relative;}
								.Listing_page_control {margin-top: 10px; user-select: none;}
								.Listing_page_control .market_paging_controls {margin-top: 2px;}`;
			document.body.appendChild(styleElem);
		}

		if (settings.market_adjust_selllistings) {
			adjustMySellListings();
		}

		if (settings.market_adjust_history) {
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
			marketListings.innerHTML = "<div style='text-align: center;'><img src='https://community.steamstatic.com/public/images/login/throbber.gif' alt='载入中'></div>";
			
			var styleElem = document.createElement("style");
			styleElem.innerHTML = `#tabContentsMyListings .market_pagesize_options, #tabContentsMyListings #tabContentsMyActiveMarketListings_ctn {display: none;}
									.market_listing_check {position: absolute; top: 15px; right: 20px; cursor: pointer; transform: scale(2); }
									#tabContentsMyActiveMarketListingsTable .market_listing_table_header {display: flex; flex-direction: row-reverse;}
									#tabContentsMyActiveMarketListingsTable .market_listing_table_header span:last-child {flex: 1 1 auto; text-align: center;}
									#tabContentsMyActiveMarketListingsTable .market_listing_table_header > span {cursor: pointer;}
									#tabContentsMyActiveMarketListingsTable .market_listing_table_header > span:hover {background: #324965;}
									#tabContentsMyActiveMarketListingsRows .market_listing_row .market_listing_my_price {cursor: pointer; position: relative;}
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

			if (settings.market_show_priceinfo) {
				autoShowPriceInfo(listings);
			}
		}

		//显示市场历史记录
		async function showMarketHistory(event) {
			event.preventDefault();
			event.stopPropagation();
			unsafeWindow.HideHover();
			document.querySelector("#tabContentsMyListings").hide();
			document.querySelector("#tabContentsMyMarketHistory").show();
			document.querySelector("#tabMyListings").addClassName("market_tab_well_tab_inactive");
			document.querySelector("#tabMyListings").removeClassName("market_tab_well_tab_active");
			document.querySelector("#tabMyMarketHistory").addClassName("market_tab_well_tab_active");
			document.querySelector("#tabMyMarketHistory").removeClassName("market_tab_well_tab_inactive");

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
				var selectBtn1 = document.querySelector("#market_page_control_after .market_select_all")
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
			if (data.assets && data.assets[753] && data.assets[753][6]) {
				var assets  = data.assets[753][6];
				var marketData = {};
				for (var assetid in assets) {
					var info = assets[assetid];
					if (info.type && info.name && info.market_hash_name) {
						marketData[info.type + info.name] = info.market_hash_name;
					}
				}

				var historyRows = document.querySelectorAll("#tabContentsMyMarketHistoryRows .market_listing_row");
				for (var row of historyRows) {
					var name = row.querySelector(".market_listing_item_name").textContent;
					var gameName = row.querySelector(".market_listing_game_name").textContent;
					if (marketData[gameName + name]) {
						var hashName = encodeURIComponent(marketData[gameName + name]);
						row.querySelector(".market_listing_item_name").innerHTML = `<a class="market_listing_item_name_link" href="https://steamcommunity.com/market/listings/753/${hashName}" target="_blank">${name}</a>`;
					}
				}
			}
		}

		function getListingAssetInfo(listing) {
			var args = listing.querySelector("a.item_market_action_button_edit").href.match(/RemoveMarketListing\((.+)\)/)[1].replace(/ /g, "").split(",");
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
		function showListingPriceInfo(event) {
			var listing = event.currentTarget.parentNode;
			var assetInfo = getListingAssetInfo(listing);
			var marketHashName = getMarketHashName(assetInfo);
			dialogPriceInfo.show(assetInfo.appid, marketHashName, currencyInfo, function(data) {
				addPriceLabel(listing, data);
			});
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
				marketMyListingsPage.push(listings.slice(start, start + settings.market_page_size));
				start += settings.market_page_size;
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
					dialogPriceInfo.checkUpdateItemOrdersHistogram(assetInfo.appid, hashName, data);
				}
			}
		}
	}

	//steam物品市场界面
	function steamMarketListingPage() {  
		if(location.href.search(/steamcommunity\.com\/market\/listings\//) < 0) {
			return;
		}
		var settings = getSteamCommunitySettings();
		addSteamCommunitySetting();

		//修改页面布局
		if (settings.marketlisting_set_style) {
			changeMarketListingPage();
		}

		//添加销量信息
		if (settings.marketlisting_show_priceoverview) {
			showPriceOverview();
		}

		//添加商店页面链接按键
		if (settings.marketlisting_append_linkbtn) {
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

			var assetInfo = getAssetInfo();
			var appid = assetInfo.appid;
			var marketHashName = getMarketHashName(assetInfo);
			var currencyInfo = getCurrencyInfo(settings.currency_code);
		
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
										<a href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${appid}" class="page_link_btn" target="_blank"><span>打开Exchange页面</span></a>`;
				var market_commodity_order_block = document.querySelector("div.market_commodity_order_block");
				if (market_commodity_order_block) {
					market_commodity_order_block.appendChild(linkElem);
				}
			}
		}

		function getAssetInfo() {
			var assets = unsafeWindow.g_rgAssets;
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
		if(location.href.search(/steamcommunity\.com\/(id|profiles)\/.+\/gamecards/) < 0) {
			return;
		}

		var settings = getSteamCommunitySettings();
		addSteamCommunitySetting();

		var currencyInfo = getCurrencyInfo(settings.currency_code);

		//修改页面布局
		if (settings.gamecards_set_style) {
			changeGameCardsPage();
		}

		if (settings.gamecards_show_priceoverview || settings.gamecards_append_linkbtn) {
			appendItemPriceInfoBtn();
		}

		//添加链接按键
		if (settings.gamecards_append_linkbtn) {
			appendCardsPageLinkBtn();
		}

		function changeGameCardsPage() {  //修改页面布局
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

		function appendCardsPageLinkBtn() {
			var res = location.href.match(/\/gamecards\/(\d+)/);
			if (res && res.length > 1) {
				var appid = res[1];
			} 
			var storeBtn = document.createElement("a");
			storeBtn.className = "btn_grey_grey btn_medium";
			storeBtn.innerHTML = "<span>打开商店页面</span>";
			storeBtn.href = `https://store.steampowered.com/app/${appid}`;
			storeBtn.setAttribute("target", "_blank");
			storeBtn.style.marginRight = "4px";
			var exchangeInventoryBtn = document.createElement("a");
			exchangeInventoryBtn.className = "btn_grey_grey btn_medium";
			exchangeInventoryBtn.innerHTML = "<span>打开Exchange页面</span>";
			exchangeInventoryBtn.href = `https://www.steamcardexchange.net/index.php?inventorygame-appid-${appid}`;
			exchangeInventoryBtn.setAttribute("target", "_blank");

			var elem = document.querySelector("div.badge_detail_tasks>div.gamecards_inventorylink")
			if (!elem) {
				elem = document.createElement("div");
				elem.className = "gamecards_inventorylink";
				document.querySelector("div.badge_detail_tasks").insertBefore(elem, document.querySelector("div.badge_detail_tasks").firstElementChild);
			}
			elem.appendChild(storeBtn);
			elem.appendChild(exchangeInventoryBtn);
		}

		async function appendItemPriceInfoBtn() {
			var styleElem = document.createElement("style");
			styleElem.innerHTML = ".market_link {display: block; color: #EBEBEB; font-size: 12px; background: #00000066; padding: 3px; text-align: center;}";
			document.body.appendChild(styleElem);

			var res = location.href.match(/\/gamecards\/(\d+)/);
			if (res && res.length > 1) {
				var gameid = res[1];
			} else {
				return;
			}

			var res1 = location.href.match(/\/gamecards\/\d+\/?\?border=(\d)/);
			if (res1 && res1.length > 1) {
				var cardborder = res1[1];
			} else {
				var cardborder = 0;
			}

			var response = await searchMarketGameItems(gameid, 2, cardborder);
			if (response.success && response.results.length == 0) {
				var response = await searchMarketGameItems(gameid, 2, cardborder);
			}
			if (response.success) {
				var results = response.results;
				var cardElems = document.querySelectorAll("div.badge_card_set_card");
				for (let cardElem of cardElems) {
					let image = cardElem.querySelector("img.gamecard").src;
					let title = cardElem.querySelector(".badge_card_set_title").textContent.replace(/\(\d+\)/, "").replace("(集换式卡牌)", "").replace("(Trading Card)", "").trim();
					for (let card of results) {
						let cardTitle = card.name.replace("(集换式卡牌)", "").replace("(Trading Card)", "").trim();
						if (image.includes(card.asset_description.icon_url) || title == cardTitle) {
							let hashName = card.asset_description.market_hash_name || card.hash_name;
							let html = `<a class="market_link open_market_page" href="https://steamcommunity.com/market/listings/753/${hashName}" target="_blank">打开市场页面</a>
									    <a class="market_link show_market_info" data-market-hash-name="${hashName}" style="margin-top: 5px;">起价：${card.sell_price_text}</a>`;

							cardElem.lastElementChild.innerHTML = html;
							cardElem.lastElementChild.onclick = function(event) { 
								var elem = event.target;
								if (elem.classList.contains("show_market_info")) {
									var marketHashName = elem.getAttribute("data-market-hash-name");
									dialogPriceInfo.show(753, marketHashName, currencyInfo, function(data) {
										showPirceUnderCard(marketHashName, data);
									});
								}
							};
						}
					}
				}

				//显示市场价格信息
				if (settings.gamecards_show_priceoverview) {
					getAllCardsPrice();
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
					dialogPriceInfo.checkUpdateItemOrdersHistogram(753, hashName, data);
				}
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

	}

	//市场价格信息的弹窗
	var dialogPriceInfo = {
		show: function(appid, marketHashName, currencyInfo, func1, func2) {
			this.appid = appid;
			this.marketHashName = marketHashName;
			var html = `<style>#market_info_group {display: flex; margin: 0px auto;} #market_info_group>div:first-child {margin-right: 20px;} #market_info_group>div {border: 1px solid #000000;} 
						#market_info_group .table_title, #market_info_group th, #market_info_group td {text-align: center;} #market_info_group th, #market_info_group td {min-width: 100px;} 
						#card_price_overview>span {margin-right: 40px;} #market_info_group .market_commodity_orders_table {margin: 0px auto;} 
						#market_info_group .market_commodity_orders_table tr:nth-child(even) {background: #00000033;} #market_info_group .market_commodity_orders_table tr:nth-child(odd) {background: #00000066;}</style>
						<div style="min-height: 230px;" id="dialog_price_info"><div id="card_price_overview">Loading...</div><br><div id="market_info_group">Loading...</div></div>`;
			unsafeWindow.ShowDialog(decodeURIComponent(marketHashName), html);
			this.model = document.querySelector("#dialog_price_info");

			this.showCurrentItemOrdersHistogram(appid, marketHashName, currencyInfo, func1);
			this.showCurrentPriceOverview(appid, marketHashName, currencyInfo, func2);
		},
		showCurrentItemOrdersHistogram: async function(appid, hashName, currencyInfo, func) {
			var data = await getCurrentItemOrdersHistogram(currencyInfo.country, currencyInfo.eCurrencyCode, appid, hashName);
			if (data) {
				this.checkUpdateItemOrdersHistogram(appid, hashName, data);
				if (typeof func === "function") {
					func(data);
				}
			}
		},
		checkUpdateItemOrdersHistogram: function(appid, hashName, data) {
			if  (appid == this.appid && hashName == this.marketHashName) {
				this.updateItemOrdersHistogram(data);
			}
		},
		updateItemOrdersHistogram: function(data) {
			if (this.model) {
				var elem1 = this.model.querySelector("#market_info_group");
				if (elem1) {  //在弹出窗口上显示表格
					if (data.success) {
						var html1 = `<div><div class="table_title">出售</div>${data.sell_order_table || data.sell_order_summary}</div><div><div class="table_title">购买</div>${data.buy_order_table || data.buy_order_summary}</div>`;
					} else {
						var html1 = `<div>${errorTranslator(data)}</div>`
					}
					elem1.innerHTML = html1;
				}
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
			}
		}
	};

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
		data.history_currency_code ??= "ARS";
		return data;
	}

	//添加设置按键和设置页面
	function addSteamCommunitySetting() {
		var settingBtn = document.createElement("div");
		settingBtn.setAttribute("style", "position: absolute; background-color: #3b4b5f; right: 10px; top: 10px; border-radius: 2px; box-shadow: 0px 0px 2px 0px #00000099");
		settingBtn.innerHTML = "<a style='cursor: pointer; padding: 3px 15px; line-height: 24px; font-size: 12px; color: #b8b6b4;'>设置</a>";
		settingBtn.onclick = function() {
			var settings = getSteamCommunitySettings();
			unsafeWindow.sfu_settings = settings;
			var selectOptions = "";
			for (var code in currencyData) {
				selectOptions += `<option value="${code}" ${code == settings.currency_code ? "selected='selected'": ""}>${code} ( ${currencyData[code].strSymbol} )</option>`;
			}
			var options = (`<style>.settings_container {user-select: none; width: 500px;} .settings_page_title {margin-bottom: 5px;} .settings_row {margin-left: 15px; margin-bottom: 10px;} .settings_select, .settings_row input[type="checkbox"], .settings_row label {cursor: pointer;} .settings_select {color: #EBEBEB; background: #1F1F1F;} .settings_row input[type="checkbox"] {vertical-align: middle; margin: 0 2px;}
							.settings_row input[type="number"] {color: #EBEBEB; background: #1F1F1F; width: 60px; margin-left: 5px;} .margin_right_20 {margin-right: 20px;} .settings_option {display: inline-block; margin-bottom: 5px;} .settings_row input[type="number"]::-webkit-outer-spin-button, .settings_row input[type="number"]::-webkit-inner-spin-button{-webkit-appearance: none !important;}</style>
							<div class="settings_container">
							<div><span>货币：</span><select class="settings_select"; onchange="window.sfu_settings.currency_code = this.value;" title="用于无法获取货币信息的页面，包括徽章页面和消费历史页面">${selectOptions}</select></div><br>
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
							<div class="settings_option"><label for="sfu_market_page_size">出售物品表格每页物品数量</label><input id="sfu_market_page_size" type="number" step="1" min="1" value="${settings.market_page_size}" oninput="window.sfu_settings.market_page_size = Math.max(parseInt(this.value), 10);"></input></div>
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
		data.currency_code ??= "ARS";
		data.inventory_set_style ??= true;
		data.inventory_set_filter ??= true;
		data.inventory_append_linkbtn ??= true;
		data.inventory_sell_btn ??= true;
		data.inventory_market_info ??= true;
		data.marketlisting_set_style ??= true;
		data.marketlisting_show_priceoverview ??= true;
		data.marketlisting_append_linkbtn ??= true;
		data.gamecards_set_style ??= true;
		data.gamecards_show_priceoverview ??= true;
		data.gamecards_append_linkbtn ??= true;
		data.market_adjust_selllistings ??= true;
		data.market_adjust_history ??= true;
		data.market_show_priceinfo ??= false;
		data.market_page_size ??= 100;
		data.market_page_size = Math.max(data.market_page_size, 10);
		return data;
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
		if(location.href.search(/steamcommunity\.com\/(id|profiles)\/.+\/inventory/) >= 0) {
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

	function getMarketHashName(assetInfo) {
		var marketHashName = assetInfo.market_hash_name || assetInfo.market_name || assetInfo.name;
		return encodeURIComponent(marketHashName); 
	}

	function getPriceFromSymbolStr(str) {
		str = str.trim().replace('--', '00');
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
				if (data1.success) {
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
		var args = listing.querySelector("a.item_market_action_button_edit").href.match(/RemoveMarketListing\((.+)\)/)[1].replace(/ /g, "").split(",");
		return eval(args[1]);
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

	//获取销量信息
	function getPriceOverview(country, currencyId, appid, marketHashName) {
		return new Promise(function(resolve, reject) {
			var url = `https://steamcommunity.com/market/priceoverview/?country=${country}&currency=${currencyId}&appid=${appid}&market_hash_name=${marketHashName}`;
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
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
			var url = `https://steamcommunity.com/market/search/render/?norender=1&query=${query}&start=0&count=100&search_descriptions=0&sort_column=name&sort_dir=desc&appid=753&category_753_Event%5B%5D=any&category_753_Game%5B%5D=tag_app_${gameid}`;
			if (itemclass > -1) {
				url += `&category_753_item_class%5B%5D=tag_item_class_${itemclass}`;
			}
			if (cardborder > -1) {
				url += `&category_753_cardborder%5B%5D=tag_cardborder_${cardborder}`;
			}
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
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
	function getCurrencyInfo(code, set=false) {
		var currencyDefault = {
			"country": "AR",
			"strCode": "ARS",
			"eCurrencyCode": 34,
			"strSymbol": "ARS$",
			"bSymbolIsPrefix": true,
			"bWholeUnitsOnly": false,
			"strDecimalSymbol": ",",
			"strThousandsSeparator": ".",
			"strSymbolAndNumberSeparator": " "
		};

		if (!set) {
			if (unsafeWindow.g_rgWalletInfo) {
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

		return currencyData[code] || currencyDefault;
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

