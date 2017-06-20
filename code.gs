// @see https://habrahabr.ru/post/326220/
function initialize() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("FeedList");
  var lastRow = sheet.getLastRow() + 1;
  for(var i=1, iLen=lastRow; i<iLen; i++) {
    sheet.setActiveSelection('A' + i).setValue("*");
  }
  execute();
}

function execute() {
  // Очищаю триггеры для вызова этой функции - они уже не нужны   
  removeTriggers("execute");
  
  // Получаю данные еще не обработанного канала
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("FeedList");
  var values = sheet.getDataRange().getValues();  
  var row = index(values, 0, "*");
  if (row == null) {
    return;
  }  
  // Ставлю отметку о принятии канала в обработку
  var selection = 'A' + (row+1);  
  sheet.setActiveSelection(selection).setValue("");
  // Поехали
  main(values[row][1], values[row][2], values[row][3], values[row][4]);
  
  // Запускаю эту функцию еще раз - пусть проверит наличие еще необработанных каналов
  ScriptApp.newTrigger('execute').timeBased().after(60*1*1000).create();
}

function main(url, chat, method, channel) {
  try {
    var fetch = UrlFetchApp.fetch(url);
    var raw = fetch.getContentText();
    var feed = /encoding/.test(raw) ? fetch.getContentText(/encoding=["'](\S+)["']/.exec(raw)[1]) : fetch.getContentText();
    var items = getItems(feed);
    var i = items.length - 1;
    while (i > -1) {
      var item = items[i--];
      if (method == "fetchtext") {
        fetchText(item, chat, channel);
      } else {
        fetchPhoto(item, cha, channel);
      }
    }
  } catch (e) {
      Logger.log(e);
  };
}
 
function removeTriggers(handler) {    
  var triggers = ScriptApp.getProjectTriggers();
  for (i=0; i<triggers.length; i++) {
    if (triggers[i].getHandlerFunction() == handler) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }  
}

function getItems(feed) {
  var doc = XmlService.parse(feed);
  var root = doc.getRootElement();
  var channel = root.getChild('channel');
  var items = channel.getChildren('item');
  return items;
}

function shortenUrl(longUrl) {
  Utilities.sleep(10);
  
  try {
    // goo.gl
    var url = UrlShortener.Url.insert({
      'longUrl': longUrl
    });
    return url.id;
  } catch (e) {
    Logger.log(e);
  };
  
  try {
    // u.to
    var data = {
      'a': 'add',
      'url': longUrl
    };
    var options = {
      'method' : 'post',
      'payload' : data
    };
    return /^.*?val\('(http[^']+).*$/.exec(UrlFetchApp.fetch('http://u.to/', options).getContentText())[1];
  } catch (e) {
    Logger.log(e);
  };
  
  try {
    // is.gd
    return /shorturl": "(.*)"/.exec(UrlFetchApp.fetch("http://is.gd/create.php?format=json&url="+longUrl).getContentText())[1];
  } catch (e) {
    Logger.log(e);
  };

  try {
    // bit.ly
    return JSON.parse(UrlFetchApp.fetch("http://api.bit.ly/v3/shorten?format=json&apikey=R_8f0a190da4203b72c58e52af8b169b98&login=o_659hr4ae8j&uri="+longUrl).getContentText()).data.url;
  } catch (e) {
    Logger.log(e);
  };
  
  return longUrl;
}
 
function put(key, data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Cache");  
  var lastRow = sheet.getLastRow() + 1;
  
  sheet.setActiveSelection('A' + lastRow).setValue(new Date()); //sheet.setActiveSelection('A' + lastRow).setNumberFormat('@STRING@').setValue(new Date());
  sheet.setActiveSelection('B' + lastRow).setValue(key);
  var range = 'C' + lastRow + ":" + String.fromCharCode(67 + data.length) + lastRow;
  sheet.getRange(range).setValues(data);
}

function get(key, column) {
  column = column || 0; 
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Cache");
  var values = sheet.getDataRange().getValues();
  var row = index(values, 1, key);
  return row != null ? values[row][column] : null;
}

function index(values, pos, key) {
  for(var i=0, iLen=values.length; i<iLen; i++) {
    if(values[i][pos] == key) {
      return i;
    }
  }
  return null;
}

function fetchText(item, chat, chanel) {
  var title = item.getChildText('title');
  var author = item.getChildText('author');
  var date = new Date(item.getChildText('pubDate'));
  var description = item.getChildText('description').replace(/<\/?[^>]+>/g,' ').replace(/\s{2,}/g, '\n');

  var url = item.getChildText('link');
  if (url == null) {
    url = item.getChildText('guid');
  }
  
  // Проверить не отправлялось ли уже такое сообщение
  if (title == "" || title == null || title.length <= 0) {
      title = url;
  }
  var key = title.substr(0, 250); //Utilities.base64Encode(title.split('').reverse().join('')).substr(0, 250);
  if (get(key) != null) {
    return;
  }  
  
  // Сложить сообщение
  var template = HtmlService.createTemplateFromFile('text').getRawContent();
  var message = template.replace(/%title/g, title).replace(/%description/g, description).replace(/%url/g, shortenUrl(url)).replace(/%date/g, date);

  //+ Отправить
  // @see https://tlgrm.ru/docs/bots/api#sendmessage
  var botId = "365226583:AAHO9L5wn8W334nIPjXqqDKwI9S5I8uGGpQ"; // @nv42nhoihami8ijd3p9n_bot
  // @see https://toster.ru/q/299390
  Logger.log(UrlFetchApp.fetch("https://api.telegram.org/bot"+botId+"/sendMessage", {
           'method' : 'post',
           'payload' : {
             'chat_id': chat,
             'text': message
           }
       }));
  //- Отправить
  
  // Положить в кеш
  put(key, [[message, chanel]]);  
}

function fetchPhoto(item, chat, chanel) {
  var title = item.getChildText('title');
  var url = item.getChildText('link').replace(/www\./, "");
  var author = item.getChildText('author');
  var date = new Date(item.getChildText('pubDate'));
  var description = item.getChildText('description');

  // Проверить не отправлялось ли уже такое сообщение
  var key = url.substr(0, 250);
  if (get(key) != null) {
    return;
  }
  
  // Сложить сообщение
  var template = HtmlService.createTemplateFromFile('photo').getRawContent();
  var message = template.replace(/%title/g, title).replace(/%description/g, description.replace(/<\/?[^>]+>/g,' ').replace(/\s{2,}/g, '\n').replace(/&(l|g|quo)t;/g, '')).replace(/%url/g, shortenUrl(url)).replace(/%date/g, date);
  
  // Получить ссылку на фото
  var img = /<img[^>]+src=[\'"]([^\'"]+)[\'"].*>/i.exec(description);
  if (img == null) {
    return;
  }

  // Отправить
  // @see https://tlgrm.ru/docs/bots/api#sendmessage
  var botId = "365226583:AAHO9L5wn8W334nIPjXqqDKwI9S5I8uGGpQ";
  // @see https://toster.ru/q/299390
  Logger.log(UrlFetchApp.fetch("https://api.telegram.org/bot"+botId+"/sendPhoto", {
           'method' : 'post',
           'payload' : {
             'chat_id': chat,
             'photo': img[1],
             'caption': message
           }
       }));
       
  // Положить в кеш
  put(key, [[message, chanel]]);  
}

