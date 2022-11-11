// ==UserScript==
// @name         SteamCard
// @namespace    SteamCard
// @version      1.00
// @description  Steam Card
// @author       Nin9
// @include      *://store.steampowered.com/search*
// @require      https://cdn.bootcdn.net/ajax/libs/localforage/1.7.1/localforage.min.js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

const TIMEOUT = 20000;
const MAXCOUNT = 1300;  //获取游戏列表的总数量
const MAXPRICE = 210;  //最高价格

var checkDiscounted = 0;  //只比较打折的游戏
var lowestPrice = 13.99;  //只比较高于该价格的游戏（不包括该价格）
var exchangeRate = 158;  //汇率

async function getStoreGameList() {
    var start = 0;
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
            url: `https://store.steampowered.com/search/results/?query&start=${start}&count=50&dynamic_data=&sort_by=Price_DESC&force_infinite=1&maxprice=${MAXPRICE}&category1=998&category2=29&hidef2p=1&ndl=1&snr=${snr}&infinite=1`,
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

function processBadgePrices(res) {
    var cardData = {};
    for (var val of res.data) {
        var appid = val[0][0];
        cardData[appid] = val;
    }
    return cardData;
}

function processStoreGames(res) {
    var gameList = res.split("</a>");
    var gameData = {};
    for (var str of gameList) {
        var appidRes = str.match(/data-ds-appid=\"(\d+)\"/);
        if(appidRes) {
            var appid = parseInt(appidRes[1]);
            if (!unsafeWindow.GDynamicStore.s_rgOwnedApps[appid]) {
                var priceRes = str.match(/data-price-final=\"(\d+)\"/);
                if (priceRes) {
                    var discounted = str.includes("search_price discounted");
                    var price = parseInt(priceRes[1]) / 100.0;
                    gameData[appid] = [price, discounted];
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

(async function main() {
    var cardData = await getBadgePrices();
    if (cardData.data) {
        var gameData = await getStoreGameList();
        var res = getGamePriceUnderCardPrice(processBadgePrices(cardData), processStoreGames(gameData));
        var i = 1;
        for (var game of res) {
            console.log(i, game[1], "https://steamcommunity.com/my/gamecards/" + game[0]);
            i++;
        }
    } 
    console.log("finish");
})(); 