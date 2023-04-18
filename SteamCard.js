// ==UserScript==
// @name         SteamCard
// @namespace    SteamCard
// @version      2.0.3
// @description  Steam Card
// @author       Nin9
// @include      https://store.steampowered.com/search*
// @include      https://www.steamcardexchange.net/*
// @require      https://cdn.bootcdn.net/ajax/libs/localforage/1.7.1/localforage.min.js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

const TIMEOUT = 20000;

// 搜索商店游戏的条件
const START = 0;
const MAXCOUNT = 10000;  //获取游戏列表的总数量
const MAXPRICE = 70;  //最高价格
const PRICE_ASC = true;  //价格从低到高
const CATEGORY2 = false;  //只搜索有卡牌的游戏

// 过滤游戏的条件
var checkCardWorth = true;  //是否比较卡牌的价值
var onlyDiscounted = false;  //只比较打折的游戏
var lowestPrice = 14;  //只比较高于该价格的游戏（不包括该价格）
var exchangeRate = 200;  //汇率
var cardWorthScale = 0.7;  //卡牌价值与比索的比例
var checkAccoutOwned = false;  //只比较主账号已拥有的游戏

var flags_searchGamePriceUnderCardPrice = false;  //查找价格比其卡片价格低的游戏
var flags_searchGameToExchange = false;  //查找可通过交换卡片回本的游戏

var flags_checkHaveCard = true;  //检查游戏是否有可交换卡片

var flags_compareAccoutsGames = false;  //另一账号已拥有而当前账号未拥有的游戏
var flags_saveOwnedGames = false;  //保存已拥有的游戏id

async function getStoreGameList() {
    var start = START;
    var snr = unsafeWindow.g_rgCurrentParameters.snr;
    var gameList = "";
    var errorCount = 0;
    while (start < MAXCOUNT) {
        var data = await getStoreSearchResults(start, snr);
        if (data.success) {
            gameList += data.results_html;
            start += 50;
            errorCount = 0;
            if (start >= data.total_count) {
                break;
            }
        } else {
            errorCount++;
            if (errorCount > 10) {
                console.log("getStoreGameList failed");
                return {success: false};
            }
            await sleep(1000);
        }
    }
    return {success: true, data: gameList};
}

function getStoreSearchResults(start, snr) {
    return new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
            url: `https://store.steampowered.com/search/results/?query&start=${start}&count=50&dynamic_data=&sort_by=${PRICE_ASC ? "Price_ASC" : "Price_DESC"}&force_infinite=1&maxprice=${MAXPRICE}&category1=998${CATEGORY2 ? "&category2=29" : ""}&hidef2p=1&ndl=1&snr=${snr}&infinite=1`,
            method: "GET",
            timeout: TIMEOUT,
            onload: function(res) {
                if (res.status = 200) {
                    try {
                        resolve(JSON.parse(res.responseText));
                    } catch (e) {
                        console.log("getStoreSearchResults failed");
                        console.log(e);
                        resolve({status: 2, start: start});
                    }
                } else {
                    console.log("getStoreSearchResults failed");
                    resolve(res);
                }
            },
            onerror: function(err) {
                console.log("getStoreSearchResults error");
                resolve(err);
            },
            ontimeout: function() {
                console.log("getStoreSearchResults timeout");
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
    var s_rgOwnedApps = unsafeWindow.GDynamicStore.s_rgOwnedApps;
    for (var str of gameList) {
        var appidRes = str.match(/data-ds-appid=\"(\d+)\"/);
        if(appidRes) {
            var appid = parseInt(appidRes[1]);
            if (owned || !s_rgOwnedApps[appid]) {
                var priceRes = str.match(/data-price-final=\"(\d+)\"/);
                if (priceRes) {
                    var discounted = str.includes("search_price discounted");
                    var price = parseInt(priceRes[1]) / 100.0;
                    gameData[appid] = [price, discounted, appid, !!s_rgOwnedApps[appid]];
                }
            }
        }
    }
    return gameData;
}

async function getGamePriceUnderCardPrice(cardData, gameData) {
    var resData = [];
    var ownedGames = localforage.createInstance({name: "owned_games_id"});
    var ownedGamesList = await ownedGames.getItem("ownedApps");
    for (var appid in gameData) {
        var gamePrice = gameData[appid][0];
        var discounted = gameData[appid][1];
        if ((!onlyDiscounted || discounted) && cardData[appid] && gamePrice > lowestPrice && (!checkAccoutOwned || ownedGamesList.indexOf(appid.toString()))) {
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
    var html = "<style>.my_link{line-height: 25px; margin-left: 20px;} .my_price{margin-left: 20px;}</style>";
    
    var cardData = await getBadgePrices();
    if (cardData.data) {
        var gameData = await getStoreGameList();
        if (gameData.success) {        
            var res = await getGamePriceUnderCardPrice(processBadgePrices(cardData), processStoreGames(gameData.data));
            var i = 1;
            
            for (var game of res) {
                html += `<div><span class="my_num">${i}</span>
                         <a href="https://store.steampowered.com/app/${game[0]}" target="_blank" class="my_link">${game[1]}<a>
                         <a href="https://steamcommunity.com/my/gamecards/${game[0]}" target="_blank" class="my_link">${game[0]}</a></div>`
                //console.log(i, game[1], "https://steamcommunity.com/my/gamecards/" + game[0]);
                i++;
            }
        } else {
            html += "<div><span>getStoreGameList error</span></div>";
        }
    } else {
        html += "<div><span>getBadgePrices error</span></div>";
    }

    html += "<div><span>searchGamePriceUnderCardPrice finished</span></div>";
    document.querySelector("#search_resultsRows").innerHTML = html;
    console.log("searchGamePriceUnderCardPrice finish");
}

async function searchGameToExchange() {
    if (location.href.search(/store\.steampowered\.com\/search/) < 0) {
        return;
    }
    console.log("searchGameToExchange start");
    var html = "<style>.my_link{line-height: 25px; margin-left: 20px;} .my_price{margin-left: 20px;}</style>";

    var ownedGames = localforage.createInstance({name: "owned_games_id"});
    var ownedGamesList = await ownedGames.getItem("ownedApps");

    var inventoryData = await getInventory();
    if (inventoryData.data) {
        var gameData = await getStoreGameList();
        if (gameData.success) {
            var inventoryData1 = processInventory(inventoryData);
            var gameData1 = processStoreGames(gameData.data);
            var results = [];
            for (var appid in gameData1) {
                if (inventoryData1[appid]) {
                    var gamePrice = gameData1[appid][0];
                    var discounted = gameData1[appid][1];
                    var worth = inventoryData1[appid][1];
                    var cardsInSet = inventoryData1[appid][3][0];
                    if ((!onlyDiscounted || discounted) && (!checkCardWorth || worth * Math.ceil(cardsInSet / 2) * cardWorthScale / 1.15 > gamePrice) && (!checkAccoutOwned || ownedGamesList.indexOf(appid.toString()) >=0)) {
                        results.push(gameData1[appid]);
                    }
                }
            }
            results.sort(function(a, b) {return a[0] - b[0]});
            
            for (var i = 0; i < results.length; i++) {
                var appid = results[i][2];
                html += `<div><span class="my_num">${i+1}</span>
                         <a href="https://store.steampowered.com/app/${appid}" target="_blank" class="my_link">${results[i][0]}</a>
                         <a href="https://steamcommunity.com/my/gamecards/${appid}" target="_blank" class="my_link">${appid}</a>
                         <a href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${appid}" target="_blank" class="my_link">${inventoryData1[appid][1]} * ${Math.ceil(inventoryData1[appid][3][0] / 2.0)}</a></div>`;
            }
        } else {
            html += "<div><span>getStoreGameList error</span></div>";
        }
    } else {
        html += "<div><span>getInventory error</span></div>";
    }
    html += "<div><span>searchGameToExchange finished</span></div>";
    document.querySelector("#search_resultsRows").innerHTML = html;
    console.log("searchGameToExchange finish");
}

function saveOwnedGames() {
    if (location.href.search(/store\.steampowered\.com\/search/) < 0) {
        return;
    }

    var ownedGames = localforage.createInstance({name: "owned_games_id"});
    var s_rgOwnedApps = unsafeWindow.GDynamicStore.s_rgOwnedApps;

    appids = []
    for (var aid in s_rgOwnedApps) {
        if (s_rgOwnedApps[aid]) {
            appids.push(aid)
        }
        
    }  

    ownedGames.setItem("ownedApps", appids, function(err) {
        console.log("saveOwnedGames done")
    });
}

function compareAccoutsGames() {
    if (location.href.search(/store\.steampowered\.com\/search/) < 0) {
        return;
    }

    var ownedGames = localforage.createInstance({name: "owned_games_id"});
    var s_rgOwnedApps = unsafeWindow.GDynamicStore.s_rgOwnedApps;
    var gamesId = []
    var html = "<style>.my_link{line-height: 25px; margin-left: 20px;} .my_price{margin-left: 20px;}</style>";
    var index = 0

    ownedGames.getItem("ownedApps", function(err, appids) {
        for (var aid of appids) {
            if (!s_rgOwnedApps[parseInt(aid)]) {
                gamesId.push(aid)
                index++;
                html += `<div><span class="my_num">${index}</span>
                        <a href="https://store.steampowered.com/app/${aid}" target="_blank" class="my_link">${aid}</a>
                        <a href="https://steamcommunity.com/my/gamecards/${aid}" target="_blank" class="my_link">${aid}</a>
                        <a href="https://www.steamcardexchange.net/index.php?inventorygame-appid-${aid}" target="_blank" class="my_link">${aid}</a></div>`;
            }
        }
        document.querySelector("#search_resultsRows").innerHTML = html;

    })
}


var checkInventoryData;
async function checkHaveCard() {
    if (location.href.search(/store\.steampowered\.com\/search/) < 0) {
        return;
    }
    var res = await getInventory();
    if (res.data) {
        checkInventoryData = processInventory(res);
        console.log("getExchangeInventory success");
    } else {
        console.log("getExchangeInventory failed");
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


function sleep(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time);
    });
}


(function main() {
    flags_searchGamePriceUnderCardPrice && searchGamePriceUnderCardPrice();
    flags_searchGameToExchange && searchGameToExchange();
    flags_checkHaveCard && checkHaveCard();
    flags_saveOwnedGames && saveOwnedGames();
    flags_compareAccoutsGames && compareAccoutsGames();
})(); 