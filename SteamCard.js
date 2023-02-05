// ==UserScript==
// @name         SteamCard
// @namespace    SteamCard
// @version      1.03
// @description  Steam Card
// @author       Nin9
// @include      https://store.steampowered.com/search*
// @include      https://www.steamcardexchange.net/*
// @require      https://cdn.bootcdn.net/ajax/libs/localforage/1.7.1/localforage.min.js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

const TIMEOUT = 20000;

const START = 0;
const MAXCOUNT = 10000;  //获取游戏列表的总数量
const MAXPRICE = 70;  //最高价格
const PRICE_ASC = true;  //价格从低到高
const CATEGORY2 = true;  //只搜索有卡牌的游戏

var checkDiscounted = false;  //只比较打折的游戏
var lowestPrice = 14;  //只比较高于该价格的游戏（不包括该价格）
var exchangeRate = 185;  //汇率

var flags_searchGamePriceUnderCardPrice = false;  //查找价格比其卡片价格低的游戏
var flags_searchGameToExchange = false;  //查找可通过交换卡片回本的游戏
var flags_searchHighPriceCard = false;  //查找卡片价格高的游戏
var flags_checkHaveCard = true;  //检查游戏是否有可交换卡片

async function getStoreGameList() {
    var start = START;
    var snr = unsafeWindow.g_rgCurrentParameters.snr;
    var gameList = "";
    while (start < MAXCOUNT) {
        var data = await getStoreSearchResults(start, snr);
        if (data.success) {
            gameList += data.results_html;
            start += 50;
            if (start >= data.total_count) {
                break;
            }
        }
    }
    return gameList;
}

function getStoreSearchResults(start, snr) {
    return new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
            url: `https://store.steampowered.com/search/results/?query&start=${start}&count=50&dynamic_data=&sort_by=${PRICE_ASC ? "Price_ASC" : "Price_DESC"}&force_infinite=1&maxprice=${MAXPRICE}&category1=998${CATEGORY2 ? "&category2=29" : ""}&hidef2p=1&ndl=1&snr=${snr}&infinite=1`,
            method: "GET",
            timeout: TIMEOUT,
            onload: function(res) {
                if (res.status = 200) {
                    resolve(JSON.parse(res.responseText));
                } else {
                    console.log("getStoreGameList failed");
                    resolve(res);
                }
            },
            onerror: function(err) {
                console.log("getStoreGameList error");
                resolve(err);
            },
            ontimeout: function() {
                console.log("getStoreGameList timeout");
                resolve({status: 408});
            }
        });
    });
}


//[[appid, name], cards in set, price, your level, last update]
function getBadgePrices() {
    return new Promise(function (resolve, reject) {
        var d = new Date();
        var time = d.getTime();
        GM_xmlhttpRequest({
            url: `https://www.steamcardexchange.net/api/request.php?GetBadgePrices_Member&_=${time}`,
            method: "GET",
            timeout: TIMEOUT,
            onload: function(res) {
                if (res.status = 200) {
                    resolve(JSON.parse(res.responseText));
                } else {
                    console.log("getBadgePrices failed");
                    resolve(res);
                }
            },
            onerror: function(err) {
                console.log("getBadgePrices error");
                resolve(err);
            },
            ontimeout: function() {
                console.log("getBadgePrices timeout");
                resolve({status: 408});
            }
        });
    });
}

//[[appid, name, ?, ?, ?], worth, stock, [cards in set, sets availabel, ?]]
function getInventory() {
    return new Promise(function (resolve, reject) {
        var d = new Date();
        var time = d.getTime();
        GM_xmlhttpRequest({
            url: `https://www.steamcardexchange.net/api/request.php?GetInventory&_=${time}`,
            method: "GET",
            timeout: TIMEOUT,
            onload: function(res) {
                if (res.status = 200) {
                    resolve(JSON.parse(res.responseText));
                } else {
                    console.log("getInventory failed");
                    resolve(res);
                }
            },
            onerror: function(err) {
                console.log("getInventory error");
                resolve(err);
            },
            ontimeout: function() {
                console.log("getInventory timeout");
                resolve({status: 408});
            }
        });
    });
}

function processBadgePrices(res) {
    var cardData = {};
    for (var val of res.data) {
        var appid = val[0][0];
        cardData[appid] = val;
    }
    return cardData;
}

function processInventory(res) {
    var cardData = {};
    for (var val of res.data) {
        var appid = val[0][0];
        cardData[appid] = val;
    }
    return cardData;
}

function processStoreGames(res, owned) {
    var gameList = res.split("</a>");
    var gameData = {};
    for (var str of gameList) {
        var appidRes = str.match(/data-ds-appid=\"(\d+)\"/);
        if(appidRes) {
            var appid = parseInt(appidRes[1]);
            if (owned || !unsafeWindow.GDynamicStore.s_rgOwnedApps[appid]) {
                var priceRes = str.match(/data-price-final=\"(\d+)\"/);
                if (priceRes) {
                    var discounted = str.includes("search_price discounted");
                    var price = parseInt(priceRes[1]) / 100.0;
                    gameData[appid] = [price, discounted, appid];
                }
            }
        }
    }
    return gameData;
}

function getGamePriceUnderCardPrice(cardData, gameData) {
    var resData = [];
    for (var appid in gameData) {
        var gamePrice = gameData[appid][0];
        var discounted = gameData[appid][1];
        if ((!checkDiscounted || (checkDiscounted && discounted)) && cardData[appid] && gamePrice > lowestPrice) {
            var cardPrice = parseFloat(cardData[appid][2].replace("$", ""));
            if (gamePrice <= ((cardPrice - 0) * 0.5 * exchangeRate / 1.15)) {
                resData.push([appid, gamePrice, cardData[appid]]);
            }
        }
    }
    resData.sort(function(a, b) {return a[1] - b[1]});
    return resData;
}

async function searchGamePriceUnderCardPrice() {
    if (location.href.search(/store\.steampowered\.com\/search/) < 0) {
        return;
    }
    console.log("searchGamePriceUnderCardPrice start");
    var cardData = await getBadgePrices();
    if (cardData.data) {
        var gameData = await getStoreGameList();
        var res = getGamePriceUnderCardPrice(processBadgePrices(cardData), processStoreGames(gameData));
        var i = 1;
        var html = "<style>.my_link{line-height: 25px; margin-left: 20px;} .my_price{margin-left: 20px;}</style>";
        for (var game of res) {
            html += `<div><span class="my_num">${i}</span><span class="my_price">${game[1]}<span><a href="https://steamcommunity.com/my/gamecards/${game[0]}" target="_blank" class="my_link">${game[0]}</a></div>`
            //console.log(i, game[1], "https://steamcommunity.com/my/gamecards/" + game[0]);
            i++;
        }
        document.querySelector("#search_resultsRows").innerHTML = html;
    } 
    console.log("searchGamePriceUnderCardPrice finish");
}

async function searchHighPriceCard() {
    if (location.href.search(/www\.steamcardexchange\.net/) < 0) {
        return;
    }
    console.log("searchHighPriceCard start");
    var inventoryData = await getInventory();
    var cardData = await getBadgePrices();
    if (inventoryData.data && cardData.data) {
        var inventoryData1 = processInventory(inventoryData);
        var cardData1 = processBadgePrices(cardData);
        var results = [];
        for (var appid in inventoryData1) {
            if (cardData1[appid]) {
                var price = parseFloat(cardData1[appid][2].replace("$", ""));
                var worth = inventoryData1[appid][1];
                var stock = inventoryData1[appid][2];
                var cardsInSet = inventoryData1[appid][3][0];
                if (price > 0.3 && (price * exchangeRate / Math.ceil(worth * 1.5) / cardsInSet) > 0.7 && stock > 0 && cardsInSet < 11) {
                    results.push([appid, worth, cardsInSet]);
                }
            } 
        }
        for (var i = 0; i < results.length; i++) {
            console.log(i+1, results[i][1], results[i][2], "https://steamcommunity.com/my/gamecards/" + results[i][0]);
        }
    }
    console.log("searchHighPriceCard finish");
}

async function searchGameToExchange() {
    if (location.href.search(/store\.steampowered\.com\/search/) < 0) {
        return;
    }
    console.log("searchGameToExchange start");
    var inventoryData = await getInventory();
    var gameData = await getStoreGameList();
    if (inventoryData.data && gameData) {
        var inventoryData1 = processInventory(inventoryData);
        var gameData1 = processStoreGames(gameData);
        var results = [];
        for (var appid in gameData1) {
            if (inventoryData1[appid]) {
                var gamePrice = gameData1[appid][0];
                var worth = inventoryData1[appid][1];
                var cardsInSet = inventoryData1[appid][3][0];
                if (worth * Math.ceil(cardsInSet / 2) * 0.7 / 1.15 > gamePrice) {
                    results.push(gameData1[appid]);
                }
            }
        }
        results.sort(function(a, b) {return a[0] - b[0]});
        var html = "<style>.my_link{line-height: 25px; margin-left: 20px;} .my_price{margin-left: 20px;}</style>";
        for (var i = 0; i < results.length; i++) {
            html += `<div><span class="my_num">${i+1}</span><span class="my_price">${results[i][0]}</span><a href="https://steamcommunity.com/my/gamecards/${results[i][2]}" target="_blank" class="my_link">${results[i][2]}</a><a href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${results[i][2]}" target="_blank" class="my_link">${results[i][2]}</a></div>`;
            //console.log(i+1, results[i][0], "https://steamcommunity.com/my/gamecards/" + results[i][2], "https://www.steamcardexchange.net/index.php?inventorygame-appid-" + results[i][2]);
        }
        document.querySelector("#search_resultsRows").innerHTML = html;
    } 
    console.log("searchGameToExchange finish");
}

var checkInventoryData;
async function checkHaveCard() {
    if (location.href.search(/store\.steampowered\.com\/search/) < 0) {
        return;
    }
    var res = await getInventory();
    if (res.data) {
        checkInventoryData = processInventory(res);
        console.log("get");
    }
    document.querySelector("#search_results").onmouseover = function(event) {
        var elem = event.target;
        elem = elem.tagName == "A" ? elem : elem.parentNode.tagName == "A" ? elem.parentNode : elem.parentNode.parentNode.tagName == "A" ? elem.parentNode.parentNode : elem;
        var appid = elem.getAttribute("data-ds-appid");
        if (elem.classList.contains("search_result_row") && !elem.classList.contains("exchange_added") && appid && checkInventoryData && checkInventoryData[appid]) {
            var span = document.createElement("span");
            span.innerHTML = `W: ${checkInventoryData[appid][1]}, S: ${checkInventoryData[appid][2]}, C: ${checkInventoryData[appid][3][0]}`;
            span.style.marginRight = "10px";
            span.style.float = "right";
            var tg = elem.querySelector(".platform_img");
            tg.parentNode.insertBefore(span, tg);
            elem.classList.add("exchange_added");
            if (checkInventoryData[appid][2] <= 0) {
                elem.style.background = "#000000";
            }
        }
    }

}

(function main() {
    flags_searchGamePriceUnderCardPrice && searchGamePriceUnderCardPrice();
    flags_searchGameToExchange && searchGameToExchange();
    flags_searchHighPriceCard && searchHighPriceCard();
    flags_checkHaveCard && checkHaveCard();
})(); 