// ==UserScript==
// @name         Steam功能和界面优化
// @namespace    SteamFunctionAndUiOptimization
// @version      1.0
// @description  Steam功能和界面优化
// @author       Nin9
// @include      *://store.steampowered.com/search*
// @include      *://store.steampowered.com/wishlist*
// @include      *://steamcommunity.com/id/*/inventory*
// @include      *://steamcommunity.com/profiles/*/inventory*
// @include      *://steamcommunity.com/market/listings/753/*
// @include      *://steamcommunity.com/id/*/gamecards/*
// @include      *://steamcommunity.com/profiles/*/gamecards/*
// @require      https://cdn.bootcdn.net/ajax/libs/localforage/1.7.1/localforage.min.js
// @grant        unsafeWindow
// ==/UserScript==

const TIMEOUT = 20000;

function steamStorePage() {  //steam商店
	if(location.href.search(/store\.steampowered\.com\/(search|wishlist)/) < 0) {
		return;
	}

	var appid, title;
	var settings = getSettings();
	addSettingsBtn();
	
	//点击游戏名时选中并自动复制，点击图片跳转到徽章页面
	if (settings.set_click) {
		handleSearchResult();
		handleWishlist();
	}
	
	//搜索结果排序和过滤
	if (settings.set_filter) {
		filterSearchResult();
	}

	function handleSearchResult() {
		if (location.href.search(/store\.steampowered\.com\/search/) < 0) {
			return;
		}
		var styleElem = document.createElement("style");
		styleElem.innerHTML = "span.title {user-select:all; cursor:text; }";
		document.body.appendChild(styleElem);
		document.querySelector("div#search_results").addEventListener("click", searchResultClicked);

		//添加选项"添加至购物车"
		var obs = new MutationObserver(function(record, obs) {
			var elem = checkAddedOptionsTooltip(record);
			if (elem) {
				appendOpiton(elem);
			} else {
				var elems = document.querySelectorAll(".ds_options_tooltip");
				for(var el of elems) {
					el.parentNode.removeChild(el);
				}
			}
		});
		obs.observe(document.body, {childList: true}); 
	}

	function handleWishlist() {
		if (location.href.search(/store\.steampowered\.com\/wishlist/) < 0) {
			return;
		}
		var styleElem = document.createElement("style");
		styleElem.innerHTML = "a.title {user-select:all; cursor:text; }";
		document.body.appendChild(styleElem);
		document.querySelector("div#wishlist_ctn").addEventListener("click", wishlistClicked);
	}

	function filterSearchResult() {  //搜索结果排序和过滤
		if (location.href.search(/store\.steampowered\.com\/search/) < 0) {
			return;
		}
		var searchWord = document.querySelector("input#term").value;
		if (searchWord == "" || searchWord == "输入搜索词或标签") {
			var flag = false;
			if (document.querySelector("input#sort_by").value != "Price_ASC") {  //价格从低到高
				document.querySelector("input#sort_by").value = "Price_ASC";
				document.querySelector("a#sort_by_trigger").innerHTML = document.querySelector("a#Price_ASC").innerHTML;
				flag = true;
				//console.log("price ASC");
			}
	
			if (document.querySelector("input#price_range").value != "1") {  //价格范围
				document.querySelector("input#price_range").value = "1";
				document.querySelector("input#maxprice_input").value = rgPriceStopData[1].price;
				document.querySelector("div#price_range_display").textContent = rgPriceStopData[1].label;
				flag = true;
				//console.log("price range");
			}
	
			if (document.querySelector("input#hidef2p").value != "1") {   //隐藏免费开玩
				document.querySelector("input#hidef2p").value = "1";
				document.querySelector("div.tab_filter_control_row[data-param='hidef2p']").classList.add("checked");
				document.querySelector("span.tab_filter_control_include[data-param='hidef2p']").classList.add("checked");
				flag = true;
				//console.log("hidef2p")
			}
	
			if (document.querySelector("div#narrow_category1 input#category1").value != "998") {  //只搜索游戏
				document.querySelector("div#narrow_category1 input#category1").value = "998";
				document.querySelector("div#narrow_category1 div.tab_filter_control_row[data-value='998']").classList.add("checked");
				document.querySelector("div#narrow_category1 span.tab_filter_control.tab_filter_control_include[data-value='998']").classList.add("checked");
				flag = true;
				//console.log("game only");
			}
	
			if (document.querySelector("div#narrow_category2 input#category2").value != "29") {  //只搜索有卡牌
				document.querySelector("div#narrow_category2 input#category2").value = "29";
				document.querySelector("div#narrow_category2 div.tab_filter_control_row[data-value='29']").classList.add("checked");
				document.querySelector("div#narrow_category2 span.tab_filter_control.tab_filter_control_include[data-value='29']").classList.add("checked");
				flag = true;
				//console.log("has card");
			}
	
			if (flag) {
				unsafeWindow.AjaxSearchResults();
			}
		}
	}

	//添加设置按键
	function addSettingsBtn() {
		var settingBtn = document.createElement("div");
		settingBtn.className = "store_header_btn_gray store_header_btn";
		settingBtn.innerHTML = "<a class='store_header_btn_content' style='cursor: pointer;'>设置</a>";
		settingBtn.onclick = function() {
			unsafeWindow.sfu_settings = settings;
			var options = (`<div style="user-select: none;">
							<div><input id="sfu_set_click" type="checkbox" onclick="window.sfu_settings.set_click = this.checked;" ${settings.set_click ? "checked=true" : ""} style="cursor: pointer;"></input><label for="sfu_set_click" style="cursor: pointer;">点击游戏名时选中并复制，点击图片跳转到徽章页面</label></div><br>
							<div><input id="sfu_set_filter" type="checkbox" onclick="window.sfu_settings.set_filter = this.checked;" ${settings.set_filter ? "checked=true" : ""} style="cursor: pointer;"></input><label for="sfu_set_filter" style="cursor: pointer;">价格由低到高显示有卡牌的游戏</label></div><br></div>`);
			unsafeWindow.ShowConfirmDialog("Steam功能和界面优化", options).done(function() {
				settings = unsafeWindow.sfu_settings;
				setStorageValue("SFU_SETTINGS", settings);
			});
		};
		var cartElem = document.querySelector("div#cart_status_data");
		cartElem.insertBefore(settingBtn, cartElem.firstElementChild);
	}

	function searchResultClicked(event) {
		var elem = event.target;
		if (elem.classList.contains("title")) {  //点击游戏名时选中并自动复制
			event.preventDefault();
			document.execCommand("Copy"); 
		} else if (elem.classList.contains("ds_options") || elem.parentNode.classList.contains("ds_options")) {
			appid = getAppid(elem, event.currentTarget);
			title = getTitle(elem, event.currentTarget);
		} else if (elem.classList.contains("search_capsule") || elem.parentNode.classList.contains("search_capsule")) {  //点击游戏图片
			event.preventDefault();
			var aid = getAppid(elem, event.currentTarget);
			if (aid) {
				var url = `https://steamcommunity.com/my/gamecards/${aid}/`; 
				if(event.ctrlKey) {
					var win = window.open(url, "_blank");
				} else {
					var win = window.open(url, "_self");
				}
			}
		}  
	}

	function wishlistClicked(event) {
		var elem = event.target;
		if (elem.classList.contains("title")) {
			event.preventDefault();
			document.execCommand("Copy"); 
			var appid = elem.href.match(/store\.steampowered\.com\/app\/(\d+)/)[1];
			if (event.ctrlKey) {
				window.open(`https://steamcommunity.com/my/gamecards/${appid}/`, "_blank");
			}
		}
	}
	
	function getAppid(elem, stopElem) {
		var el = elem;
		while(el != stopElem) {
			if(el.classList.contains("search_result_row")) {
				return el.getAttribute("data-ds-appid");
			}
			el = el.parentNode;
		}
		return null;
	}

	function getTitle(elem, stopElem) {
		var el = elem;
		while(el != stopElem) {
			if(el.classList.contains("search_result_row")) {
				return el.querySelector("span.title").textContent;
			}
			el = el.parentNode;
		}
		return null;
	}

	function checkAddedOptionsTooltip(record) {
		for (var rd of record) {
			if (rd.addedNodes.length > 0) {
				for (var node of rd.addedNodes) {
					if (node.classList && node.classList.contains("ds_options_tooltip")) {
						return node;
					}
				}
			}
		}
		return null;
	}

	function appendOpiton(elemTarget) {
		elemTarget = elemTarget || document.querySelector(".ds_options_tooltip");
		if (elemTarget && !elemTarget.querySelector("#add_to_cart_btn")) {
			var elem = document.createElement("div");
			elem.className = "option";
			elem.id = "add_to_cart_btn";
			elem.innerHTML = "添加至购物车";
			elemTarget.appendChild(elem);
			elem.onclick = autoAddToCart;
		}
	}

	function autoAddToCart() {  //自动添加到购物车
		if (appid && title) {
			var win = unsafeWindow.open("https://store.steampowered.com/app/" + appid, "_blank", "width=800, height=800");
			win.addEventListener("DOMContentLoaded", function() {
				var elems = win.document.querySelectorAll("div.game_area_purchase_game");
				for (var el of elems) {
					if(el.id) {
						var hTitle = el.querySelector("h1").textContent;
						var index = hTitle.indexOf(title);
						var subid = el.id.match(/add_to_cart_(\d+)$/);
						if (index >= 0 && hTitle.substring(index) == title && subid && subid.length > 1) {
							el.querySelector("#btn_add_to_cart_" + subid[1]).click();
						}
					}
				}
			});
		}
	}

	function getSettings() {
		var data = getStorageValue("SFU_SETTINGS") || {};
		typeof data.set_click === "undefined" && (data.set_click = true);
		typeof data.set_filter === "undefined" && (data.set_filter = true);
		return data;
	}
	
}

function steamInventoryPage(){  //优化库存界面
	if(location.href.search(/steamcommunity\.com\/(id|profiles)\/.+\/inventory/) < 0) {
		return;
	}
	var settings = getSteamCommunitySettings();
	addSteamCommunitySetting();

	//修改页面布局
	if (settings.inventory_set_style) {
		changeInventoryPage();
	}

	//只显示普通卡牌
	if (settings.inventory_set_filter) {
		waitLoadInventory();
	}

	if (settings.inventory_append_linkbtn) {
		appendInventoryPageLinkBtn();
	}

	function changeInventoryPage() {  //修改页面布局
		var styleElem = document.createElement("style");
		styleElem.innerHTML = "div#inventory_logos {margin: 10px; padding: 0px; width: 500px;}" 
								+ "div#tabcontent_inventory {padding-top: 12px;}"
								+ "div.inventory_rightnav {margin: 0px 12px 12px auto; display: flex;}"
								+ "div.inventory_rightnav>a, div.inventory_rightnav>div {flex: 0 0 auto; overflow: hidden; margin-bottom: auto;}"
								+ "div#inventory_sell_buttons span {padding: 0px 10px; font-size: 12px; line-height: 20px;}"
								+ "div#inventory_sell_buttons {display: none;}";
		document.body.appendChild(styleElem);
	
		document.querySelector("div.inventory_links").style.margin = "0px";
		var inventory_rightnav = document.querySelector("div.inventory_rightnav");
		var context_selector = document.querySelector("div#context_selector");
		var context_selector_parent = context_selector.parentNode;
		inventory_rightnav.style.marginRight = "12px";
		context_selector_parent.style.display = "flex";
		context_selector_parent.style.flexWrap = "wrap";
		context_selector_parent.style.justifyContent = "center";
		context_selector_parent.appendChild(inventory_rightnav);
	
		var inventory_logos = document.querySelector("div#inventory_logos");
		document.querySelector("div#active_inventory_page>div.inventory_page_left").insertBefore(inventory_logos, document.querySelector("div#inventory_pagecontrols").nextElementSibling);
	
		var targetElem = document.querySelector("#iteminfo0_market_content");
		targetElem.parentNode.insertBefore(targetElem, targetElem.parentNode.firstElementChild);
		var targetElem = document.querySelector("#iteminfo1_market_content");
		targetElem.parentNode.insertBefore(targetElem, targetElem.parentNode.firstElementChild);
	}
	
	function waitLoadInventory() {  //等待物品加载完设置过滤
		var isLoaded = true;
		if (typeof unsafeWindow.g_ActiveInventory  === "undefined" || unsafeWindow.g_ActiveInventory == null || !unsafeWindow.g_ActiveInventory.appid) {
			isLoaded = false;
		}
		if (isLoaded && unsafeWindow.g_ActiveInventory.appid != 753) {
			return;
		}
		if (isLoaded && !(unsafeWindow.g_ActiveInventory.m_$Inventory && unsafeWindow.g_ActiveInventory.m_$Inventory.length > 0)) {
			isLoaded = false;
		}
		if (document.querySelectorAll("#filter_options .econ_tag_filter_category").length == 0) {
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
		var checkbox = document.querySelector("#tag_filter_753_6_cardborder_cardborder_0");
		if (checkbox) {
			checkbox.click();
		}
	}

	function appendInventoryPageLinkBtn() {
		var btns0 = document.createElement("div");
		btns0.id = "inventory_link_btn0";
		btns0.className = "item_owner_actions";
		btns0.style.padding = "10px 0px 0px 10px";
		btns0.style.display = "none";
		var iconElem = document.querySelector("#iteminfo0_content>div.item_desc_icon");
		iconElem.style.display = "flex";
		iconElem.appendChild(btns0);
		var btns1 = document.createElement("div");
		btns1.id = "inventory_link_btn1";
		btns1.className = "item_owner_actions";
		btns1.style.padding = "10px 0px 0px 10px";
		btns1.style.display = "none";
		var iconElem = document.querySelector("#iteminfo1_content>div.item_desc_icon");
		iconElem.style.display = "flex";
		iconElem.appendChild(btns1);

		document.querySelector("#inventories").addEventListener("click", function(event) {
			var elem = event.target;
			if (!elem.href) {
				return;
			}
			var res = elem.href.match(/753_\d+_(\d+)/);
			if (res && res.length > 1) {
				var assetid = res[1];
				var appid = unsafeWindow.g_ActiveInventory.m_rgAssets[assetid].market_fee_app;
				var isfoil = unsafeWindow.g_ActiveInventory.m_rgAssets[assetid].market_hash_name.search(/Foil/) < 0 ? false : true;
				var html = `<a class="btn_small btn_grey_white_innerfade" href="https://steamcommunity.com/my/gamecards/${appid}/${isfoil ? '?border=1' : ''}"><span>打开徽章页面</span></a>
							<a class="btn_small btn_grey_white_innerfade" href="https://store.steampowered.com/app/${appid}"><span>打开商店页面</span></a>
							<a class="btn_small btn_grey_white_innerfade" href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${appid}"><span>Exchange页面</span></a>`;
				
				document.querySelector("#inventory_link_btn0").innerHTML = html;
				document.querySelector("#inventory_link_btn1").innerHTML = html;
				document.querySelector("#inventory_link_btn0").style.display = "block";
				document.querySelector("#inventory_link_btn1").style.display = "block";
			} else {
				document.querySelector("#inventory_link_btn0").style.display = "none";
				document.querySelector("#inventory_link_btn1").style.display = "none";
			}
		});
	}

}

function steamMarketListingPage(){  //优化steam卡牌市场信息界面
	if(location.href.search(/steamcommunity\.com\/market\/listings\/753\//) < 0) {
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
		styleElem.innerHTML = "div.market_header_bg {display: none;}" 
								+ "div.market_listing_largeimage, div.market_listing_largeimage>img {width: 120px; height: 120px;}"
								+ "div#largeiteminfo_content {min-height: 50px;}"
								+ "a.market_commodity_buy_button {margin: 10px;}"
								+ "a.market_commodity_buy_button>span {line-height: 25px; font-size: 15px;}"
								+ "div.market_commodity_order_summary, div.market_commodity_orders_header {min-height: 0px;}"
								+ "div.market_commodity_explanation {margin: 10px;}"
								+ "div.market_commodity_orders_block {min-height: 0px;}"
								+ "div.my_listing_section {margin: 0px;}"
								+ "div#largeiteminfo_item_descriptors {overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 0px;}";
		document.body.appendChild(styleElem);
	
		var market_listing_iteminfo = document.querySelector("div.market_listing_iteminfo");
		market_listing_iteminfo.appendChild(document.querySelector("div#market_activity_section"));
	}

	async function showPriceOverview() {  //添加销量信息
		var styleElem = document.createElement("style");
		styleElem.innerHTML = "div.price_overview {margin: 10px 10px 0px 10px;} div.price_overview>span {margin-right: 50px;}";
		document.body.appendChild(styleElem);

		var elem = document.createElement("div");
		elem.className = "price_overview";
		document.querySelector("div.market_commodity_order_block").appendChild(elem);

		var assetsInfo = getAssetsInfo(unsafeWindow.g_rgAssets);
		var appid = assetsInfo[0].appid;
		var marketHashName = getMarketHashName(assetsInfo[0]);
		var walletInfo = getWalletInfo(settings.currency_code);
	
		var data = await getPriceOverview(walletInfo.country, walletInfo.eCurrencyCode, appid, marketHashName);
		if (data.success) {
			var html = `<span>最低售价：${data.lowest_price}</span>`;
			if (data.volume) {
				html += `<span>24h销量：${data.volume} 个</span>`;
			}
			if (data.median_price) {
				html += `<span>24h售价：${data.median_price}</span>`;
			}
		} else {
			var html = `<span>${errorTranslator(data)}</span>`;
		}
		elem.innerHTML = html;
	}

	function appendMarketlistingPageLinkBtn() {
		var appid = location.href.match(/\/market\/listings\/753\/(\d+)\-/)[1];
		var isfoil = location.href.search(/Foil/) < 0 ? false : true;
		var linkElem = document.createElement("a");
		linkElem.setAttribute("style", "");
		linkElem.innerHTML = `<a href="https://steamcommunity.com/my/gamecards/${appid}/${isfoil ? '?border=1' : ''}" class="btn_green_white_innerfade btn_medium" style="padding: 3px 10px; margin: 10px 0px 0px 0px; font-size: 14px;">打开徽章页面</a>
								<a href="https://store.steampowered.com/app/${appid}" class="btn_green_white_innerfade btn_medium" style="padding: 3px 10px; margin: 10px 0px 0px 0px; font-size: 14px;">打开商店页面</a>
								<a href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${appid}" class="btn_green_white_innerfade btn_medium" style="padding: 3px 10px; margin: 10px 0px 0px 0px; font-size: 14px;">打开Exchange页面</a>`;
		document.querySelector("div.market_commodity_order_block").appendChild(linkElem);
	}
}

function steamGameCardsPage() {  //徽章界面显示卡牌价格信息
	if(location.href.search(/steamcommunity\.com\/(id|profiles)\/.+\/gamecards/) < 0) {
		return;
	}
	var storageDB = localforage.createInstance({name: "sfu_storage"});
	var settings = getSteamCommunitySettings();
	addSteamCommunitySetting();

	var walletInfo = getWalletInfo(settings.currency_code);
	var itemPriceInfo = {
		overview: {},
		gram: {}
	};

	//修改页面布局
	if (settings.gamecards_set_style) {
		changeGameCardsPage();
	}

	if (settings.gamecards_show_priceoverview || settings.gamecards_append_linkbtn) {
		appendItemPriceInfoBtn();
	}

	//显示市场信息
	if (settings.gamecards_show_priceoverview) {
		getAllCardsPrice();
	}

	//添加链接按键
	if (settings.gamecards_append_linkbtn) {
		appendCardsPageLinkBtn();
	}

	function changeGameCardsPage() {  //修改页面布局
		var styleElem = document.createElement("style");
		styleElem.innerHTML = "div.badge_card_to_collect_links {text-align-last: right;}"
								+ "div.game_card_unowned_border {display: none;}"
								+ "div.badge_card_set_card {width: 146px; margin-bottom: 10px;}"
								+ "div.game_card_ctn {height: 170px;}";
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
		storeBtn.style.marginRight = "4px";
		var exchangeInventoryBtn = document.createElement("a");
		exchangeInventoryBtn.className = "btn_grey_grey btn_medium";
		exchangeInventoryBtn.innerHTML = "<span>打开Exchange页面</span>";
		exchangeInventoryBtn.href = `https://www.steamcardexchange.net/index.php?inventorygame-appid-${appid}`;

		var elem = document.querySelector("div.badge_detail_tasks>div.gamecards_inventorylink")
		if (!elem) {
			elem = document.createElement("div");
			elem.className = "gamecards_inventorylink";
			document.querySelector("div.badge_detail_tasks").insertBefore(elem, document.querySelector("div.badge_detail_tasks").firstElementChild);
		}
		elem.appendChild(storeBtn);
		elem.appendChild(exchangeInventoryBtn);
	}

	function appendItemPriceInfoBtn() {
		var styleElem = document.createElement("style");
		styleElem.innerHTML = ".market_link {display: block; color: #EBEBEB; font-size: 12px; background: #00000066; padding: 3px; text-align: center;}";
		document.body.appendChild(styleElem);

		var nameList = getGameCardsHashName();
		var cardElems = document.querySelectorAll("div.badge_card_set_card");

		for (let i = 0; i < nameList.length; i++) {
			var html = `<a class="market_link open_market_page" href="https://steamcommunity.com/market/listings/753/${nameList[i]}">打开市场页面</a>
						<a class="market_link show_market_info" data-market-hash-name="${nameList[i]}" style="margin-top: 5px;">查看市场信息</a>`;
			cardElems[i].lastElementChild.innerHTML = html;
			cardElems[i].lastElementChild.onclick = function(event) { 
				var elem = event.target;
				if (elem.classList.contains("show_market_info")) {
					showItemPriceInfo(elem.getAttribute("data-market-hash-name"));
				}
			};
		}
	}

	async function showItemPriceInfo(marketHashName) {
		var html = `<style>#market_info_group {display: flex; margin: 0px auto;} #market_info_group>div:first-child {margin-right: 20px;} #market_info_group>div {border: 1px solid #000000;} .table_title {text-align: center;} th, td {background: #1b2838; min-width: 100px; text-align: center;} #card_price_overview>span {margin-right: 40px;}</style>
					<div style="min-height: 230px;"><div id="market_info_group">Loading...</div><br><div id="card_price_overview">Loading...</div></div>`;
		unsafeWindow.ShowDialog(decodeURIComponent(marketHashName), html);

		showCurrentItemOrdersHistogram(marketHashName);
		showCurrentPriceOverview(marketHashName);
	}

	async function getAllCardsPrice() {
		var elems = document.querySelectorAll(".show_market_info");
		for (let el of elems) {
			var hashName = el.getAttribute("data-market-hash-name");
			await showCurrentItemOrdersHistogram(hashName);
		}
	}

	async function showCurrentItemOrdersHistogram(hashName) {
		var data1 = await getCurrentItemOrdersHistogram(hashName);
		if (data1) {
			var elem1 = document.querySelector("#market_info_group");
			if (elem1) {
				if (data1.success) {
					var html1 = `<div><div class="table_title">出售</div>${data1.sell_order_table}</div><div><div class="table_title">购买</div>${data1.buy_order_table}</div>`;
				} else {
					var html1 = `<div>${errorTranslator(data1)}</div>`
				}
				elem1.innerHTML = html1;
			}
			var elem2 = document.querySelector(`.show_market_info[data-market-hash-name="${hashName}"]`);
			if (elem2) {
				if (data1.success) {
					var html2 = walletInfo.bSymbolIsPrefix ? `${walletInfo.strSymbol} ${data1.sell_order_graph[0][0]} | ${walletInfo.strSymbol} ${data1.buy_order_graph[0][0]}` : `${data1.sell_order_graph[0][0]} ${walletInfo.strSymbol} | ${data1.buy_order_graph[0][0]} ${walletInfo.strSymbol}`;
				} else {
					var html2 = errorTranslator(data1);
				}
				elem2.innerHTML = html2;
				elem2.title = html2;
			}
		}
	}

	async function showCurrentPriceOverview(hashName) {
		var data2 = await getCurrentPriceOverview(hashName);
		if (data2) {
			var elem = document.querySelector("#card_price_overview");
			if (elem) {
				if (data2.success) {
					var html2 = "";
					if (data2.lowest_price) {
						html2 += `<span>最低售价：${data2.lowest_price}</span>`;
					}
					if (data2.volume) {
						html2 += `<span>24h销量：${data2.volume} 个</span>`;
					}
					if (data2.median_price) {
						html2 += `<span>24h售价：${data2.median_price}</span>`;
					}
				} else {
					var html2 = `<span>${errorTranslator(data2)}</span>`;
				}
				elem.innerHTML = html2;	
			}
		}
	}

	async function getCurrentItemOrdersHistogram(hashName) {
		if (itemPriceInfo.gram[hashName]) {
			if (itemPriceInfo.gram[hashName].loaded) {
				return itemPriceInfo.gram[hashName];
			} else {
				return null;
			}
		} else {
			itemPriceInfo.gram[hashName] = {};
			var res = await getItemNameId(hashName, storageDB);
			if (res.success) {
				var itemNameId = res.nameid;
				var data1 = await getItemOrdersHistogram(walletInfo.country, walletInfo.eCurrencyCode, itemNameId);
				if (data1.success) {
					itemPriceInfo.gram[hashName] = data1;
					itemPriceInfo.gram[hashName].loaded = true;
				} else {
					delete itemPriceInfo.gram[hashName];
				}
				return data1;
			} else {
				delete itemPriceInfo.gram[hashName];
				return res;
			}
		}
	}

	async function getCurrentPriceOverview(hashName) {
		if (itemPriceInfo.overview[hashName]) {
			if (itemPriceInfo.overview[hashName].loaded) {
				return itemPriceInfo.overview[hashName];
			} else {
				return null;
			}
		} else {
			itemPriceInfo.overview[hashName] = {};
			var data2 = await getPriceOverview(walletInfo.country, walletInfo.eCurrencyCode, 753, hashName);
			if (data2.success) {
				itemPriceInfo.overview[hashName] = data2;
				itemPriceInfo.overview[hashName].loaded = true;
			} else {
				delete itemPriceInfo.overview[hashName];
			}
			return data2;
		}
	}
	
	function getGameCardsHashName() {
		var linkElems = document.querySelectorAll("div.gamecards_inventorylink>a");
		if (linkElems && linkElems.length > 0) {
			var url = "/market/multisell?appid=753&contextid=6";
			var url2 = "/market/multibuy?appid=753";
			for (var elem of linkElems) {
				var index = elem.getAttribute("href").indexOf(url);
				var index2 = elem.getAttribute("href").indexOf(url2);
				if (index > -1) {
					var tempList = elem.getAttribute("href").substring(index + url.length).split("&");
					break;
				} else if (index2 > -1) {
					var tempList = elem.getAttribute("href").substring(index2 + url2.length).split("&");
					break;
				}
			}
		}
		var nameList = [];
		if (tempList && tempList.length > 0) {
			var key = "items[]=";
			for (var str of tempList) {
				if (str.indexOf(key) == 0) {
					nameList.push(str.substring(key.length));
				}
			}
		}
		return nameList;
	}

}

//添加设置按键和设置页面
function addSteamCommunitySetting() {
	var settingBtn = document.createElement("div");
	settingBtn.setAttribute("style", "position: absolute; color: #EBEBEB; background: #4c5564; left: 10px; bottom: 20px;");
	settingBtn.innerHTML = "<a style='cursor: pointer; padding: 3px 15px; line-height: 24px;'>设置</a>";
	settingBtn.onclick = function() {
		var settings = getSteamCommunitySettings();
		unsafeWindow.sfu_settings = settings;
		var selectOptions = "";
		for (var code in currencyData) {
			selectOptions += `<option value="${code}" ${code == settings.currency_code ? "selected='selected'": ""}>${code} ( ${currencyData[code].strSymbol} )</option>`;
		}
		var options = (`<style>.settings-container {user-select: none;} .settings-page-title {margin-bottom: 5px;} .settings-row {margin-left: 15px;} .settings-select, .settings-row input, .settings-row label {cursor: pointer;} .settings-select {color: #EBEBEB; background: #1F1F1F;} .margin-right-20 {margin-right: 20px;}</style>
						<div class="settings-container"><div><span>货币：</span><select class="settings-select"; onchange="window.sfu_settings.currency_code = this.value;">${selectOptions}</select></div><br>
						<div class="settings-page-title">库存页面设置：</div>
						<div class="settings-row">
						<input id="sfu_inventory_set_style" type="checkbox" ${settings.inventory_set_style ? "checked=true" : ""} onclick="window.sfu_settings.inventory_set_style = this.checked;"></input><label for="sfu_inventory_set_style" class="margin-right-20">修改页面布局</label>
						<input id="sfu_inventory_set_filter" type="checkbox" ${settings.inventory_set_filter ? "checked=true" : ""} onclick="window.sfu_settings.inventory_set_filter = this.checked;"></input><label for="sfu_inventory_set_filter" class="margin-right-20">只显示普通卡牌</label>
						<input id="sfu_inventory_append_linkbtn" type="checkbox" ${settings.inventory_append_linkbtn ? "checked=true" : ""} onclick="window.sfu_settings.inventory_append_linkbtn = this.checked;"></input><label for="sfu_inventory_append_linkbtn">添加链接按键</label>
						</div><br>
						<div class="settings-page-title">市场页面设置：</div>
						<div class="settings-row">
						<input id="sfu_marketlisting_set_style" type="checkbox" ${settings.marketlisting_set_style ? "checked=true" : ""} onclick="window.sfu_settings.marketlisting_set_style = this.checked;"></input><label for="sfu_marketlisting_set_style" class="margin-right-20">修改页面布局</label>
						<input id="sfu_marketlisting_show_priceoverview" type="checkbox" ${settings.marketlisting_show_priceoverview ? "checked=true" : ""} onclick="window.sfu_settings.marketlisting_show_priceoverview = this.checked;"></input><label for="sfu_marketlisting_show_priceoverview" class="margin-right-20">显示销量信息</label>
						<input id="sfu_marketlisting_append_linkbtn" type="checkbox" ${settings.marketlisting_append_linkbtn ? "checked=true" : ""} onclick="window.sfu_settings.marketlisting_append_linkbtn = this.checked;"></input><label for="sfu_marketlisting_append_linkbtn">添加链接按键</label>
						</div><br>
						<div class="settings-page-title">徽章页面设置：</div>
						<div class="settings-row">
						<input id="sfu_gamecards_set_style" type="checkbox" ${settings.gamecards_set_style ? "checked=true" : ""} onclick="window.sfu_settings.gamecards_set_style = this.checked;"></input><label for="sfu_gamecards_set_style" class="margin-right-20">修改页面布局</label>
						<input id="sfu_gamecards_show_priceoverview" type="checkbox" ${settings.gamecards_show_priceoverview ? "checked=true" : ""} onclick="window.sfu_settings.gamecards_show_priceoverview = this.checked;"></input><label for="sfu_gamecards_show_priceoverview" class="margin-right-20">显示市场信息</label>
						<input id="sfu_gamecards_append_linkbtn" type="checkbox" ${settings.gamecards_append_linkbtn ? "checked=true" : ""} onclick="window.sfu_settings.gamecards_append_linkbtn = this.checked;"></input><label for="sfu_gamecards_append_linkbtn">添加链接按键</label>
						</div><br></div>`);
		unsafeWindow.ShowConfirmDialog("Steam功能和界面优化", options).done(function() {
			setStorageValue("SFU_COMMUNITY_SETTINGS", unsafeWindow.sfu_settings);
			window.location.reload();
		});
	};
	document.body.appendChild(settingBtn);
}

function getSteamCommunitySettings() {
	var data = getStorageValue("SFU_COMMUNITY_SETTINGS") || {};
	typeof data.currency_code === "undefined" && (data.currency_code = "CNY");
	typeof data.inventory_set_style === "undefined" && (data.inventory_set_style = true);
	typeof data.inventory_set_filter === "undefined" && (data.inventory_set_filter = true);
	typeof data.inventory_append_linkbtn === "undefined" && (data.inventory_append_linkbtn = true);
	typeof data.marketlisting_set_style === "undefined" && (data.marketlisting_set_style = true);
	typeof data.marketlisting_show_priceoverview === "undefined" && (data.marketlisting_show_priceoverview = true);
	typeof data.marketlisting_append_linkbtn === "undefined" && (data.marketlisting_append_linkbtn = true);
	typeof data.gamecards_set_style === "undefined" && (data.gamecards_set_style = true);
	typeof data.gamecards_show_priceoverview === "undefined" && (data.gamecards_show_priceoverview = true);
	typeof data.gamecards_append_linkbtn === "undefined" && (data.gamecards_append_linkbtn = true);
	return data;
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

function getAssetsInfo(assets) {
	var assetsList = [];
	if (assets) {
		for (var appid in assets) {
			for (var contextid in assets[appid]) {
				for (var assetid in assets[appid][contextid]) {
					assetsList.push(assets[appid][contextid][assetid]);
				}
			}
		}
	}
	return assetsList;
}

function getMarketHashName(assetInfo) {
	return encodeURIComponent(unsafeWindow.GetMarketHashName(assetInfo)); 
}

//获取销量信息
function getPriceOverview(country, currencyId, appid, marketHashName) {
	return new Promise(function(resolve, reject) {
		var url = `https://steamcommunity.com/market/priceoverview/?country=${country}&currency=${currencyId}&appid=${appid}&market_hash_name=${marketHashName}`
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

function getItemNameId(marketHashName, storage) {
	return new Promise(async function (resolve, reject) {
		try {
			var data = await storage.getItem(marketHashName);
		} catch (e) {
			console.log(e);
			var data = null;
		}

		if (data != null) {
			resolve({success: true, nameid: data});
		} else {
			var url = "https://steamcommunity.com/market/listings/753/"+ marketHashName;
			var xhr = new XMLHttpRequest();
			xhr.timeout = TIMEOUT;
			xhr.open("GET", url, true);
			xhr.onload = function(e) {
				if (e.target.status == 200) {
					var html = e.target.responseText;
					var res = html.match(/Market_LoadOrderSpread\(\s?(\d+)\s?\)/);
					if (res && res.length > 1) {
						storage.setItem(marketHashName, res[1]);
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
    }
}

//获取钱包货币信息
function getWalletInfo(code) {
	var walletDefault = {
		"country": "CN",
        "strCode": "CNY",
        "eCurrencyCode": 23,
        "strSymbol": "¥",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
	};
	return currencyData[code] || walletDefault;
}

(function() {
	steamStorePage();
	steamInventoryPage();
	steamMarketListingPage();
	steamGameCardsPage();
})();

//添加到购物车会添加免费的
//徽章页面销量信息
//库存页面添加链接