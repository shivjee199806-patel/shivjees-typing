'use strict';
// JP_DYNAMIC_MATTER_UNIVERSE_V8_EXAM_DIFFICULTY_ONLY_20260923
// Daily passage composer v5: dynamic broad-topic, bilingual, difficulty-graded long-source passages.
// Design goals:
// 1) stored source matter is long enough for a 30-minute selection,
// 2) exam UI can trim that source to the selected exam/time rule,
// 3) Practice rules stay unchanged; Exam mode alone gets a stronger Medium-to-Hard numeric/punctuation progression,
// 4) Exam + Practice draw from a broad procedural topic universe instead of a short fixed list,
// 5) exact full passages and exact topic-angle signatures never repeat; recent base subjects also cool down.
const crypto=require('crypto');
const legacyDaily=require('./daily-passages-legacy');
const LEVELS=['Easy','Medium','Moderate to Hard','Hard'];
const EXAM_COUNTS=[1,1,1,1];
const PRACTICE_COUNTS=[1,1,1,1]; // Daily load rule: one passage per difficulty per language.
const PRACTICE_30_MIN_WORDS={English:1350,Hindi:1080};

function rng(seed){let n=crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE();return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296}}
function wordCount(s){return (String(s||'').trim().match(/\S+/g)||[]).length}
function shuffle(a,random){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function pick(a,random){return a[Math.floor(random()*a.length)]}
function number(random,a,b){return a+Math.floor(random()*(b-a+1))}
function parseWordMap(ex){try{const x=typeof ex?.duration_word_map==='string'?JSON.parse(ex.duration_word_map||'{}'):(ex?.duration_word_map||{});return x&&typeof x==='object'?x:{}}catch(_){return {}}}
function matterWordsForExam(ex,minutes){
 const mins=Math.max(1,Number(minutes)||Number(ex?.duration)||10),slug=String(ex?.slug||'').toLowerCase(),name=String(ex?.name||'').toLowerCase(),lang=String(ex?.language||'English').toLowerCase();
 if(slug.includes('upp-co')||name.includes('up police computer operator'))return Math.max(1,Math.round((lang==='hindi'?408:510)*mins/15));
 const map=parseWordMap(ex),keys=Object.keys(map).map(Number).filter(k=>Number.isFinite(k)&&k>0&&Number(map[String(k)])>0).sort((a,b)=>a-b);
 if(keys.length){const near=keys.reduce((a,b)=>Math.abs(b-mins)<Math.abs(a-mins)?b:a,keys[0]);return Math.max(1,Math.round(Number(map[String(near)])*mins/near));}
 const baseMinutes=Math.max(1,Number(ex?.duration)||mins),minimum=Math.max(0,Number(ex?.min_words)||0),wpm=Math.max(0,Number(ex?.required_wpm)||0);
 return Math.max(1,Math.round(minimum>0?(minimum/baseMinutes)*mins:(wpm||30)*mins));
}
function sourceTargetWords(language,targetType,exam,difficulty='Medium'){
 if(targetType==='practice'||targetType==='live')return PRACTICE_30_MIN_WORDS[language]||900;
 // Keep every existing Exam setting untouched. Only the generated Hard Exam source is kept in the requested character band.
 if(targetType==='exam'&&difficulty==='Hard')return language==='Hindi'?760:610;
 // Other Exam levels continue to use the existing exam/time settings.
 return matterWordsForExam(exam,30);
}

// Original topic bank written for typing practice. These are not claimed to be official/PYQ passages.
// Each topic is a set of factual or exam-style ideas. The composer reshapes and reorders them every day.
const TOPICS=[
 {key:'high-court',en:'A High Court and the Work Behind a Case File',hi:'उच्च न्यायालय और एक वाद फाइल के पीछे का कार्य',facts:[
  ['A High Court deals with constitutional, civil, criminal and administrative matters through benches and judicial offices.','उच्च न्यायालय में संवैधानिक, दीवानी, फौजदारी और प्रशासनिक प्रकृति के अनेक मामलों पर न्यायिक पीठों और कार्यालयों के माध्यम से कार्य होता है।'],
  ['A petition becomes useful only when its parties, case number, dates and supporting papers are entered in a consistent order.','याचिका तभी व्यवस्थित रूप से उपयोगी होती है जब पक्षकारों के नाम, वाद संख्या, तिथियाँ और संलग्न कागजात सही क्रम में दर्ज हों।'],
  ['Cause lists help advocates, litigants and court staff know which matters are expected to be taken up on a working day.','वाद सूची से अधिवक्ताओं, पक्षकारों और न्यायालय कर्मचारियों को यह जानकारी मिलती है कि कार्य दिवस पर किन मामलों की सुनवाई अपेक्षित है।'],
  ['Certified copies are prepared through a defined record process because even a small transcription error may change the meaning of an order.','प्रमाणित प्रतियाँ निर्धारित अभिलेख प्रक्रिया से तैयार की जाती हैं क्योंकि छोटी टंकण त्रुटि भी आदेश का अर्थ बदल सकती है।'],
  ['Record rooms preserve older files so that an order, pleading or exhibit can be traced when a later proceeding requires it.','अभिलेख कक्ष पुराने वादों को सुरक्षित रखते हैं ताकि बाद की कार्यवाही में आदेश, प्रार्थना पत्र या साक्ष्य की आवश्यकता होने पर उसे खोजा जा सके।'],
  ['Digitisation has made search and listing faster, but scanned records still need careful indexing and verification.','डिजिटलीकरण से खोज और सूचीकरण तेज हुआ है, फिर भी स्कैन किए गए अभिलेखों का सावधानी से अनुक्रमण और सत्यापन आवश्यक रहता है।'],
  ['Court staff must protect confidential information and should not disclose a sealed or restricted record merely because it exists in digital form.','न्यायालय कर्मचारियों को गोपनीय सूचना सुरक्षित रखनी चाहिए और डिजिटल रूप में उपलब्ध होने मात्र से सीलबंद या प्रतिबंधित अभिलेख साझा नहीं करना चाहिए।'],
  ['Legal aid, mediation and help desks can reduce confusion for people who are unfamiliar with court procedure.','विधिक सहायता, मध्यस्थता और सहायता कक्ष उन लोगों की उलझन कम कर सकते हैं जो न्यायालय की प्रक्रिया से परिचित नहीं होते।'],
  ['Clear typing is especially important in names, sections of law, dates, quoted words and references to earlier orders.','नाम, विधि की धाराएँ, तिथियाँ, उद्धृत शब्द और पुराने आदेशों के संदर्भ टाइप करते समय विशेष शुद्धता जरूरी होती है।'],
  ['An efficient registry depends on coordination between filing, scrutiny, listing, copying, dispatch and record branches.','प्रभावी रजिस्ट्री के लिए दाखिला, परीक्षण, सूचीकरण, प्रतिलिपि, प्रेषण और अभिलेख शाखाओं के बीच समन्वय आवश्यक है।'],
  ['Public trust grows when procedures are understandable, records are traceable and routine services are delivered without needless delay.','प्रक्रिया स्पष्ट हो, अभिलेख खोजे जा सकें और सामान्य सेवाएँ अनावश्यक विलंब के बिना मिलें तो जनता का विश्वास बढ़ता है।'],
  ['Technology can support justice administration, yet responsibility for accuracy still rests with the people who create and verify the record.','प्रौद्योगिकी न्याय प्रशासन में सहायक हो सकती है, लेकिन अभिलेख बनाने और जाँचने की शुद्धता की जिम्मेदारी अंततः संबंधित कर्मचारियों पर रहती है।']
 ]},
 {key:'village-water',en:'A Village Works to Protect Its Water',hi:'एक गाँव अपने जल स्रोतों को बचाने की कोशिश करता है',facts:[
  ['A village may depend on hand pumps, wells, ponds, piped supply and seasonal rain, so one source cannot always meet every need.','किसी गाँव में हैंडपंप, कुएँ, तालाब, पाइप जलापूर्ति और वर्षा पर निर्भरता हो सकती है, इसलिए एक ही स्रोत हर समय पर्याप्त नहीं होता।'],
  ['Summer shortages often reveal problems that remain hidden during the rainy season, including falling groundwater and damaged pipelines.','गर्मी की कमी अक्सर उन समस्याओं को सामने लाती है जो वर्षा ऋतु में छिपी रहती हैं, जैसे गिरता भूजल स्तर और क्षतिग्रस्त पाइपलाइन।'],
  ['A simple water register can record source condition, repair dates, complaints and the time required to restore supply.','सरल जल पंजी में स्रोत की स्थिति, मरम्मत की तिथि, शिकायत और आपूर्ति बहाल होने में लगे समय को दर्ज किया जा सकता है।'],
  ['Women and schoolchildren are often affected first when drinking water must be carried over a long distance.','जब पेयजल दूर से लाना पड़ता है तो महिलाओं और विद्यालय जाने वाले बच्चों पर इसका प्रभाव सबसे पहले दिखाई देता है।'],
  ['Rainwater harvesting works best when roofs, drains, recharge pits and storage areas are cleaned before the monsoon.','वर्षा जल संचयन तब अधिक उपयोगी होता है जब मानसून से पहले छत, नालियाँ, रिचार्ज गड्ढे और भंडारण स्थान साफ किए जाएँ।'],
  ['A village pond can support recharge and livestock, but dumping waste near it quickly damages water quality.','ग्राम तालाब भूजल पुनर्भरण और पशुओं के लिए उपयोगी हो सकता है, लेकिन उसके पास कचरा डालने से जल गुणवत्ता तेजी से खराब होती है।'],
  ['Regular testing is important where people report unusual colour, smell or taste in drinking water.','जहाँ पेयजल के रंग, गंध या स्वाद में असामान्यता की शिकायत हो वहाँ नियमित परीक्षण महत्वपूर्ण है।'],
  ['Small leaks may appear harmless, yet a leak that continues for weeks can waste a large amount of treated water.','छोटा रिसाव सामान्य लग सकता है, लेकिन कई सप्ताह तक चलता रहे तो उपचारित जल की बड़ी मात्रा व्यर्थ हो सकती है।'],
  ['Local committees can help by identifying vulnerable households, monitoring repairs and sharing schedules in simple language.','स्थानीय समितियाँ कमजोर परिवारों की पहचान, मरम्मत की निगरानी और सरल भाषा में जलापूर्ति समय बताने में सहयोग कर सकती हैं।'],
  ['Water planning should consider homes, schools, health centres, animals and irrigation instead of treating every demand as identical.','जल योजना में घर, विद्यालय, स्वास्थ्य केंद्र, पशु और सिंचाई की अलग-अलग आवश्यकताओं को ध्यान में रखना चाहिए।'],
  ['Protecting a source is usually cheaper than repeatedly arranging emergency tankers after contamination or failure.','जल स्रोत की सुरक्षा करना अक्सर प्रदूषण या खराबी के बाद बार-बार आपात टैंकर लगाने से सस्ता पड़ता है।'],
  ['The strongest village plans combine local knowledge with measurements, maintenance records and clear responsibility for each task.','सबसे प्रभावी ग्राम योजनाएँ स्थानीय अनुभव को माप, रखरखाव अभिलेख और प्रत्येक कार्य की स्पष्ट जिम्मेदारी के साथ जोड़ती हैं।']
 ]},
 {key:'rural-roads',en:'Rural Roads, Monsoon and Everyday Mobility',hi:'ग्रामीण सड़कें, मानसून और रोजमर्रा की आवाजाही',facts:[
  ['A rural road connects more than two places; it links farms, schools, markets, health services and emergency transport.','ग्रामीण सड़क केवल दो स्थानों को नहीं जोड़ती, वह खेत, विद्यालय, बाजार, स्वास्थ्य सेवा और आपात परिवहन को जोड़ती है।'],
  ['Poor drainage is a common reason for road damage because standing water weakens edges and creates potholes.','खराब जल निकासी सड़क क्षति का सामान्य कारण है क्योंकि जमा पानी किनारों को कमजोर करता है और गड्ढे बनाता है।'],
  ['Before the monsoon, blocked culverts and roadside drains should be inspected rather than waiting for the first heavy rain.','मानसून से पहले पुलिया और सड़क किनारे की बंद नालियों की जाँच कर लेनी चाहिए, पहली तेज बारिश का इंतजार नहीं करना चाहिए।'],
  ['A damaged approach to a bridge can isolate a settlement even when the bridge structure itself remains safe.','पुल की संरचना सुरक्षित रहने पर भी उसके संपर्क मार्ग के टूटने से बस्ती का आवागमन बाधित हो सकता है।'],
  ['Farmers value reliable roads because perishable produce loses time and value when vehicles cannot reach a market.','किसान भरोसेमंद सड़क को महत्व देते हैं क्योंकि वाहन बाजार तक न पहुँच पाएँ तो जल्दी खराब होने वाली उपज का समय और मूल्य दोनों घटते हैं।'],
  ['School attendance may fall during prolonged waterlogging if children must cross unsafe stretches on foot.','लंबे समय तक जलभराव रहने पर बच्चों को असुरक्षित रास्ता पैदल पार करना पड़े तो विद्यालय उपस्थिति घट सकती है।'],
  ['Maintenance records are useful when they show the exact location, type of damage, repair material and completion date.','रखरखाव अभिलेख तब उपयोगी होते हैं जब उनमें स्थान, क्षति का प्रकार, मरम्मत सामग्री और पूरा होने की तिथि स्पष्ट हो।'],
  ['Community reports can identify a new problem quickly, but inspection is still needed before technical work is approved.','स्थानीय सूचना से नई समस्या जल्दी पता चल सकती है, लेकिन तकनीकी कार्य स्वीकृत करने से पहले निरीक्षण आवश्यक रहता है।'],
  ['Road safety also depends on visibility, signs, speed control near schools and protection at sharp bends.','सड़क सुरक्षा दृश्यता, संकेतक, विद्यालय के पास गति नियंत्रण और तीखे मोड़ों पर सुरक्षा व्यवस्था पर भी निर्भर करती है।'],
  ['A durable repair addresses the cause of failure instead of placing a thin temporary layer over the damaged surface.','टिकाऊ मरम्मत केवल क्षतिग्रस्त सतह पर पतली परत चढ़ाने के बजाय खराबी के मूल कारण को ठीक करती है।'],
  ['Regular maintenance costs less than rebuilding a long section after years of neglect.','नियमित रखरखाव वर्षों की उपेक्षा के बाद लंबे हिस्से का पुनर्निर्माण करने से कम खर्चीला होता है।'],
  ['Reliable connectivity supports local trade, reduces travel uncertainty and gives rural families better access to essential services.','भरोसेमंद संपर्क स्थानीय व्यापार को सहारा देता है, यात्रा की अनिश्चितता घटाता है और ग्रामीण परिवारों को आवश्यक सेवाओं तक बेहतर पहुँच देता है।']
 ]},
 {key:'sarnath',en:'Sarnath: A Place of History, Learning and Conservation',hi:'सारनाथ: इतिहास, अध्ययन और संरक्षण का स्थल',facts:[
  ['Sarnath near Varanasi is associated with the Buddha’s first sermon after enlightenment and became an important Buddhist centre.','वाराणसी के निकट सारनाथ बुद्ध के ज्ञान प्राप्ति के बाद दिए गए प्रथम उपदेश से जुड़ा है और आगे चलकर महत्वपूर्ण बौद्ध केंद्र बना।'],
  ['The site contains remains of monasteries, stupas and other structures that reflect activity across many centuries.','यहाँ मठों, स्तूपों और अन्य संरचनाओं के अवशेष हैं जो कई शताब्दियों की गतिविधियों का संकेत देते हैं।'],
  ['The Dhamek Stupa is one of the most recognised monuments at Sarnath and is central to the visitor landscape.','धमेख स्तूप सारनाथ के सबसे पहचान योग्य स्मारकों में से एक है और परिसर के प्रमुख आकर्षणों में शामिल है।'],
  ['The Lion Capital from the Ashokan pillar at Sarnath later became the State Emblem of India.','सारनाथ के अशोक स्तंभ का सिंह शीर्ष बाद में भारत के राजचिह्न के रूप में अपनाया गया।'],
  ['Archaeological remains become easier to understand when labels explain chronology, material and the purpose of a structure without exaggeration.','पुरातात्विक अवशेष तब बेहतर समझ आते हैं जब सूचना पट्ट कालक्रम, सामग्री और संरचना के उद्देश्य को बिना अतिशयोक्ति के स्पष्ट करें।'],
  ['Conservation requires control of moisture, vegetation, visitor pressure and careless touching of fragile surfaces.','संरक्षण के लिए नमी, वनस्पति, पर्यटक दबाव और नाजुक सतहों को छूने जैसी गतिविधियों पर नियंत्रण आवश्यक है।'],
  ['Museums near archaeological sites help place sculptures, inscriptions and excavated objects in a broader historical context.','पुरातात्विक स्थलों के निकट संग्रहालय मूर्तियों, अभिलेखों और उत्खनन से मिली वस्तुओं को व्यापक ऐतिहासिक संदर्भ में समझने में मदद करते हैं।'],
  ['A historical site is not only a tourist destination; it is also a source for students, researchers and local communities.','ऐतिहासिक स्थल केवल पर्यटन स्थान नहीं होता, वह विद्यार्थियों, शोधकर्ताओं और स्थानीय समुदायों के लिए भी ज्ञान का स्रोत है।'],
  ['Responsible visitors follow marked paths, avoid littering and respect areas where access is restricted for conservation.','जिम्मेदार पर्यटक निर्धारित मार्गों का पालन करते हैं, कचरा नहीं फैलाते और संरक्षण हेतु प्रतिबंधित क्षेत्रों का सम्मान करते हैं।'],
  ['Accurate guide material should separate established evidence from later stories so that history does not become confused with legend.','सही मार्गदर्शक सामग्री में प्रमाणित इतिहास और बाद की कथाओं को अलग रखना चाहिए ताकि इतिहास किंवदंती से न मिल जाए।'],
  ['The value of Sarnath lies in religion, art, archaeology and the long record of people who studied and travelled through the region.','सारनाथ का महत्व धर्म, कला, पुरातत्व और इस क्षेत्र से जुड़े अध्ययन तथा यात्राओं के लंबे इतिहास में निहित है।'],
  ['Preservation allows future generations to examine the same evidence rather than depending only on photographs or descriptions.','संरक्षण से आने वाली पीढ़ियाँ केवल चित्र या विवरण पर निर्भर रहने के बजाय उसी ऐतिहासिक साक्ष्य का अध्ययन कर सकती हैं।']
 ]},
 {key:'fatehpur',en:'Fatehpur Sikri and the Planning of a Historic City',hi:'फतेहपुर सीकरी और एक ऐतिहासिक नगर की योजना',facts:[
  ['Fatehpur Sikri was developed during the reign of Mughal emperor Akbar and served as an imperial centre for a period.','फतेहपुर सीकरी का विकास मुगल सम्राट अकबर के शासनकाल में हुआ और कुछ समय तक यह शाही केंद्र रहा।'],
  ['Its buildings show a combination of ceremonial, residential, religious and administrative functions within a planned complex.','यहाँ की इमारतों में योजनाबद्ध परिसर के भीतर समारोह, आवास, धर्म और प्रशासन से जुड़े अलग-अलग कार्य दिखाई देते हैं।'],
  ['Red sandstone gives much of the complex a visual unity even though individual buildings have distinct designs.','लाल बलुआ पत्थर परिसर को दृश्य एकरूपता देता है, जबकि अलग-अलग इमारतों की बनावट अपनी विशेष पहचान रखती है।'],
  ['Large courtyards helped organise movement and gatherings, while smaller spaces served more private purposes.','बड़े प्रांगण आवाजाही और सभाओं को व्यवस्थित करते थे, जबकि छोटे स्थान अपेक्षाकृत निजी उपयोग के लिए थे।'],
  ['Buland Darwaza is widely recognised for its scale and monumental approach.','बुलंद दरवाजा अपने विशाल आकार और भव्य प्रवेश स्वरूप के लिए व्यापक रूप से जाना जाता है।'],
  ['The complex also includes the Jama Masjid and the tomb of Sheikh Salim Chishti, adding a strong religious dimension.','परिसर में जामा मस्जिद और शेख सलीम चिश्ती की दरगाह भी है, जिससे इसका धार्मिक महत्व स्पष्ट होता है।'],
  ['Studying a historic city requires attention to water, roads, building materials, climate and the movement of people.','ऐतिहासिक नगर का अध्ययन करते समय जल, मार्ग, निर्माण सामग्री, जलवायु और लोगों की आवाजाही पर ध्यान देना आवश्यक है।'],
  ['Conservation work must respect original material while addressing weathering, visitor pressure and structural weakness.','संरक्षण कार्य में मूल सामग्री का सम्मान करते हुए मौसम के प्रभाव, पर्यटक दबाव और संरचनात्मक कमजोरी का समाधान करना पड़ता है।'],
  ['Tourism can support local livelihoods, but unmanaged crowds and waste can reduce the quality of the site.','पर्यटन स्थानीय आजीविका को सहारा दे सकता है, लेकिन अनियंत्रित भीड़ और कचरा स्थल की गुणवत्ता कम कर सकते हैं।'],
  ['Clear maps and signs help visitors understand how different buildings relate to one another.','स्पष्ट नक्शे और संकेतक पर्यटकों को यह समझने में मदद करते हैं कि अलग-अलग इमारतें एक-दूसरे से कैसे जुड़ी हैं।'],
  ['Historical interpretation should avoid turning every architectural feature into a dramatic story without evidence.','ऐतिहासिक व्याख्या में बिना प्रमाण हर स्थापत्य विशेषता को नाटकीय कहानी में बदलने से बचना चाहिए।'],
  ['Fatehpur Sikri remains valuable because it preserves a large architectural landscape rather than a single isolated monument.','फतेहपुर सीकरी का महत्व इसलिए भी है क्योंकि यहाँ एक अकेले स्मारक के बजाय विस्तृत स्थापत्य परिदृश्य सुरक्षित है।']
 ]},
 {key:'nalanda',en:'Nalanda and the Tradition of Organised Learning',hi:'नालंदा और संगठित शिक्षा की परंपरा',facts:[
  ['Ancient Nalanda in present-day Bihar became known as a major centre of learning connected with Buddhist scholarship and wider intellectual exchange.','वर्तमान बिहार में स्थित प्राचीन नालंदा बौद्ध अध्ययन और व्यापक बौद्धिक संवाद से जुड़े प्रमुख शिक्षा केंद्र के रूप में प्रसिद्ध हुआ।'],
  ['Students and teachers came from different regions, making the institution part of long-distance networks of ideas and travel.','विभिन्न क्षेत्रों से विद्यार्थी और शिक्षक आते थे, जिससे यह संस्थान विचारों और यात्राओं के दूरगामी नेटवर्क का हिस्सा बना।'],
  ['Archaeological remains include monastic and educational structures arranged around courtyards and passages.','पुरातात्विक अवशेषों में प्रांगण और मार्गों के आसपास व्यवस्थित मठ तथा अध्ययन से जुड़ी संरचनाएँ शामिल हैं।'],
  ['A large learning centre needs more than classrooms; it depends on accommodation, food, libraries, teachers and rules for daily life.','बड़े शिक्षा केंद्र को केवल कक्षाओं की नहीं, आवास, भोजन, पुस्तकालय, शिक्षक और दैनिक व्यवस्था के नियमों की भी आवश्यकता होती है।'],
  ['Accounts of travellers have helped historians understand Nalanda, but such records are compared with archaeological evidence rather than accepted uncritically.','यात्रियों के विवरण से इतिहासकारों को नालंदा समझने में सहायता मिली है, पर उन्हें बिना जाँच स्वीकार करने के बजाय पुरातात्विक साक्ष्य से मिलाया जाता है।'],
  ['Libraries are often remembered as symbols of Nalanda because organised study depends on preserving and sharing texts.','नालंदा के संदर्भ में पुस्तकालयों का उल्लेख महत्वपूर्ण है क्योंकि संगठित अध्ययन ग्रंथों के संरक्षण और साझा उपयोग पर निर्भर करता है।'],
  ['The history of the site also reminds us that institutions can decline when political, economic and social conditions change.','इस स्थल का इतिहास यह भी बताता है कि राजनीतिक, आर्थिक और सामाजिक परिस्थितियों में बदलाव से संस्थाएँ कमजोर हो सकती हैं।'],
  ['Modern conservation tries to protect excavated remains while allowing visitors to understand the scale of the old complex.','आधुनिक संरक्षण उत्खनित अवशेषों को सुरक्षित रखते हुए आगंतुकों को पुराने परिसर के विस्तार को समझने का अवसर देता है।'],
  ['A good historical description distinguishes what is visible at the site from what is known through texts and later research.','अच्छे ऐतिहासिक विवरण में स्थल पर दिखाई देने वाली वस्तुओं और ग्रंथों तथा बाद के शोध से ज्ञात जानकारी को अलग रखा जाता है।'],
  ['Educational heritage matters because it shows how people organised teaching, debate, memory and the movement of knowledge.','शैक्षिक विरासत महत्वपूर्ण है क्योंकि इससे पता चलता है कि लोग शिक्षण, वाद-विवाद, स्मृति और ज्ञान के प्रसार को कैसे व्यवस्थित करते थे।'],
  ['Local communities benefit when heritage management creates respectful employment and supports accurate interpretation.','जब विरासत प्रबंधन सम्मानजनक रोजगार पैदा करे और सही जानकारी को बढ़ावा दे तो स्थानीय समुदायों को भी लाभ मिलता है।'],
  ['Nalanda continues to attract interest because its remains connect architecture with the history of learning across Asia.','नालंदा आज भी रुचि का केंद्र है क्योंकि उसके अवशेष स्थापत्य को एशिया के शिक्षा इतिहास से जोड़ते हैं।']
 ]},
 {key:'kalam',en:'A. P. J. Abdul Kalam: Science, Service and Learning',hi:'ए. पी. जे. अब्दुल कलाम: विज्ञान, सेवा और सीखने की प्रेरणा',facts:[
  ['A. P. J. Abdul Kalam was born in Rameswaram in Tamil Nadu and studied science and engineering before beginning a long technical career.','ए. पी. जे. अब्दुल कलाम का जन्म तमिलनाडु के रामेश्वरम में हुआ और उन्होंने विज्ञान तथा अभियांत्रिकी की पढ़ाई के बाद लंबा तकनीकी जीवन शुरू किया।'],
  ['He worked with Indian space and defence programmes and became widely associated with complex national technology projects.','उन्होंने भारतीय अंतरिक्ष और रक्षा कार्यक्रमों से जुड़कर काम किया और जटिल राष्ट्रीय प्रौद्योगिकी परियोजनाओं से व्यापक रूप से जुड़े।'],
  ['Large scientific projects require teams, testing, documentation and the patience to learn from unsuccessful attempts.','बड़ी वैज्ञानिक परियोजनाओं में टीम, परीक्षण, दस्तावेज और असफल प्रयासों से सीखने का धैर्य आवश्यक होता है।'],
  ['Kalam often spoke to students about curiosity, disciplined work and the importance of setting meaningful goals.','कलाम विद्यार्थियों से जिज्ञासा, अनुशासित परिश्रम और सार्थक लक्ष्य तय करने के महत्व पर अक्सर बात करते थे।'],
  ['He served as the President of India for a five year term in the first decade of this century and continued to engage with educational institutions after his term.','उन्होंने इस सदी के पहले दशक में पाँच वर्ष तक भारत के राष्ट्रपति के रूप में सेवा की और कार्यकाल के बाद भी शैक्षिक संस्थानों से जुड़े रहे।'],
  ['His public image combined scientific work with an accessible style that made technical subjects less distant for young people.','उनकी सार्वजनिक छवि में वैज्ञानिक कार्य और सरल संवाद शैली का ऐसा मेल था जिसने युवाओं के लिए तकनीकी विषयों को अधिक सहज बनाया।'],
  ['Biographical study is strongest when achievements are placed in their institutional context instead of being presented as the work of one person alone.','जीवनी का अध्ययन तब अधिक संतुलित होता है जब उपलब्धियों को केवल एक व्यक्ति का कार्य न मानकर संस्थागत संदर्भ में रखा जाए।'],
  ['Engineering progress depends on measurement and verification, not only on inspiring ideas.','अभियांत्रिकी प्रगति केवल प्रेरक विचारों पर नहीं बल्कि माप, परीक्षण और सत्यापन पर निर्भर करती है।'],
  ['A good technical leader listens to specialists from different fields and gives teams enough room to solve difficult problems.','अच्छा तकनीकी नेतृत्व विभिन्न क्षेत्रों के विशेषज्ञों की बात सुनता है और टीमों को कठिन समस्याएँ हल करने के लिए पर्याप्त अवसर देता है।'],
  ['Kalam wrote and lectured extensively, which helped connect his professional experience with broader discussions about education and development.','कलाम ने अनेक पुस्तकें लिखीं और व्याख्यान दिए, जिससे उनके पेशेवर अनुभव का संबंध शिक्षा और विकास की व्यापक चर्चा से जुड़ा।'],
  ['Students can learn from a biography without copying every choice; the useful lesson is to examine habits, constraints and consequences.','विद्यार्थी किसी जीवनी से हर निर्णय की नकल किए बिना भी सीख सकते हैं; उपयोगी तरीका आदतों, सीमाओं और परिणामों को समझना है।'],
  ['His life is frequently used in educational material because it connects a modest beginning with sustained study, public service and scientific work.','उनका जीवन शैक्षिक सामग्री में इसलिए बार-बार आता है क्योंकि उसमें साधारण शुरुआत, निरंतर अध्ययन, सार्वजनिक सेवा और वैज्ञानिक कार्य का संबंध दिखाई देता है।']
 ]},
 {key:'patel',en:'Sardar Vallabhbhai Patel: Administration and Integration',hi:'सरदार वल्लभभाई पटेल: प्रशासन और एकीकरण',facts:[
  ['Vallabhbhai Patel trained in law and became an important leader in India’s national movement before independence.','वल्लभभाई पटेल ने विधि की शिक्षा प्राप्त की और स्वतंत्रता से पहले भारतीय राष्ट्रीय आंदोलन के महत्वपूर्ण नेता बने।'],
  ['His work in local and provincial public life gave him experience in organisation, negotiation and administration.','स्थानीय और प्रांतीय सार्वजनिक जीवन में उनके कार्य ने उन्हें संगठन, बातचीत और प्रशासन का व्यावहारिक अनुभव दिया।'],
  ['The Bardoli movement is often associated with Patel because of his role in organising peasants around revenue grievances.','बारडोली आंदोलन का उल्लेख पटेल के साथ अक्सर किया जाता है क्योंकि उन्होंने राजस्व संबंधी शिकायतों पर किसानों के संगठन में महत्वपूर्ण भूमिका निभाई।'],
  ['After independence he served as Deputy Prime Minister and Home Minister in the first Union government.','स्वतंत्रता के बाद उन्होंने पहली केंद्र सरकार में उप प्रधानमंत्री और गृह मंत्री के रूप में कार्य किया।'],
  ['The integration of princely states required political negotiation, administrative planning and decisions adapted to different local situations.','रियासतों के एकीकरण में राजनीतिक बातचीत, प्रशासनिक योजना और अलग-अलग स्थानीय परिस्थितियों के अनुसार निर्णय आवश्यक थे।'],
  ['Administrative integration was not only about maps; it also involved departments, laws, revenue systems and communication between governments.','प्रशासनिक एकीकरण केवल नक्शे का प्रश्न नहीं था, इसमें विभाग, कानून, राजस्व व्यवस्था और सरकारों के बीच संचार भी शामिल था।'],
  ['Patel supported a professional civil service for the new republic and stressed the importance of administrative continuity.','पटेल ने नए गणराज्य के लिए पेशेवर सिविल सेवा का समर्थन किया और प्रशासनिक निरंतरता के महत्व पर जोर दिया।'],
  ['Historical biographies should recognise both individual leadership and the work of many officials, colleagues and local actors.','ऐतिहासिक जीवनी में व्यक्तिगत नेतृत्व के साथ अनेक अधिकारियों, सहयोगियों और स्थानीय लोगों के योगदान को भी समझना चाहिए।'],
  ['Negotiation often succeeds when parties understand practical constraints instead of repeating only symbolic positions.','बातचीत तब अधिक सफल हो सकती है जब पक्ष केवल प्रतीकात्मक रुख दोहराने के बजाय व्यावहारिक सीमाओं को समझें।'],
  ['Public administration after a major political transition must maintain essential services while new institutions are being formed.','बड़े राजनीतिक परिवर्तन के बाद सार्वजनिक प्रशासन को नई संस्थाएँ बनाते समय आवश्यक सेवाओं की निरंतरता भी बनाए रखनी पड़ती है।'],
  ['Patel’s career is studied in history, politics and administration because it crosses several phases of late colonial and early independent India.','पटेल के जीवन का अध्ययन इतिहास, राजनीति और प्रशासन में इसलिए किया जाता है क्योंकि वह औपनिवेशिक भारत के अंतिम चरण और स्वतंत्र भारत की शुरुआत दोनों से जुड़ा है।'],
  ['A balanced account separates documented events from later praise, criticism and popular memory.','संतुलित विवरण में प्रमाणित घटनाओं को बाद की प्रशंसा, आलोचना और लोकप्रिय स्मृति से अलग रखा जाता है।']
 ]},
 {key:'savitribai',en:'Savitribai Phule and the Expansion of Education',hi:'सावित्रीबाई फुले और शिक्षा का विस्तार',facts:[
  ['Savitribai Phule became a pioneering teacher in nineteenth-century western India and worked to widen access to education.','सावित्रीबाई फुले उन्नीसवीं शताब्दी के पश्चिमी भारत में अग्रणी शिक्षिका बनीं और शिक्षा की पहुँच बढ़ाने के लिए कार्य किया।'],
  ['Her work is closely associated with Jyotirao Phule and with efforts to educate girls and communities excluded from formal learning.','उनका कार्य ज्योतिराव फुले तथा लड़कियों और औपचारिक शिक्षा से वंचित समुदायों को पढ़ाने के प्रयासों से निकटता से जुड़ा है।'],
  ['Opening a school is only the first step; regular attendance, trained teachers, learning material and social support are equally important.','विद्यालय खोलना केवल पहला कदम है, नियमित उपस्थिति, प्रशिक्षित शिक्षक, अध्ययन सामग्री और सामाजिक सहयोग भी उतने ही जरूरी हैं।'],
  ['Social reform often faces resistance because education can challenge long-established ideas about who is entitled to learn.','सामाजिक सुधार को अक्सर विरोध का सामना करना पड़ता है क्योंकि शिक्षा यह प्रश्न उठाती है कि सीखने का अधिकार किसे है।'],
  ['Savitribai’s public work included teaching, writing and support for people facing social exclusion.','सावित्रीबाई के सार्वजनिक कार्य में शिक्षण, लेखन और सामाजिक बहिष्कार का सामना कर रहे लोगों की सहायता शामिल थी।'],
  ['The history of education becomes more complete when it includes classrooms outside elite institutions and the experiences of first-generation learners.','शिक्षा का इतिहास तब अधिक पूर्ण होता है जब उसमें प्रतिष्ठित संस्थानों के बाहर की कक्षाएँ और पहली पीढ़ी के शिक्षार्थियों के अनुभव भी शामिल हों।'],
  ['A teacher working in difficult conditions must build trust with families as well as teach lessons inside the classroom.','कठिन परिस्थितियों में काम करने वाले शिक्षक को कक्षा में पढ़ाने के साथ परिवारों का विश्वास भी बनाना पड़ता है।'],
  ['Literacy gives people practical tools for correspondence, records, employment and participation in public life.','साक्षरता लोगों को पत्राचार, अभिलेख, रोजगार और सार्वजनिक जीवन में भागीदारी के लिए व्यावहारिक साधन देती है।'],
  ['Biographical accounts should avoid reducing reform to a single heroic moment because long social change usually requires repeated effort.','जीवनी में सुधार को एक ही नायकतापूर्ण घटना तक सीमित नहीं करना चाहिए क्योंकि लंबे सामाजिक परिवर्तन के लिए लगातार प्रयास आवश्यक होते हैं।'],
  ['The work of early educators is relevant today when schools discuss inclusion, safe learning spaces and equal opportunity.','प्रारंभिक शिक्षकों का कार्य आज भी प्रासंगिक है जब विद्यालय समावेशन, सुरक्षित शिक्षण वातावरण और समान अवसर की बात करते हैं।'],
  ['Historical letters, poems, institutional records and later research help reconstruct the work of reformers.','ऐतिहासिक पत्र, कविताएँ, संस्थागत अभिलेख और बाद का शोध सुधारकों के कार्य को समझने में मदद करते हैं।'],
  ['Savitribai Phule remains an important figure in discussions of education because her work linked teaching with social change.','सावित्रीबाई फुले शिक्षा की चर्चा में महत्वपूर्ण हैं क्योंकि उनके कार्य ने शिक्षण को सामाजिक परिवर्तन से जोड़ा।']
 ]},
 {key:'lakshmibai',en:'Rani Lakshmibai and the Memory of the Uprising',hi:'रानी लक्ष्मीबाई और महान विद्रोह की स्मृति',facts:[
  ['Rani Lakshmibai of Jhansi became one of the best-known figures associated with the uprising of eighteen fifty seven.','झाँसी की रानी लक्ष्मीबाई अठारह सौ सत्तावन के विद्रोह से जुड़ी सबसे प्रसिद्ध ऐतिहासिक हस्तियों में से एक बनीं।'],
  ['Her life is connected with questions of succession, the administration of Jhansi and the wider conflict that spread across north and central India.','उनका जीवन उत्तराधिकार, झाँसी के प्रशासन और उत्तर तथा मध्य भारत में फैले व्यापक संघर्ष से जुड़ा है।'],
  ['The events of that uprising involved soldiers, rulers, civilians and local grievances that differed from one region to another.','उस विद्रोह की घटनाओं में सैनिक, शासक, आम लोग और अलग-अलग क्षेत्रों की भिन्न स्थानीय शिकायतें शामिल थीं।'],
  ['Historical memory often turns complex events into simple stories, so researchers compare official records, local accounts and later narratives.','ऐतिहासिक स्मृति जटिल घटनाओं को सरल कथा में बदल देती है, इसलिए शोधकर्ता सरकारी अभिलेख, स्थानीय विवरण और बाद की कथाओं की तुलना करते हैं।'],
  ['Jhansi was a fortified centre, and control of routes and defences mattered greatly during military operations.','झाँसी एक किलेबंद केंद्र था और सैन्य कार्रवाई के दौरान मार्ग तथा रक्षा व्यवस्था पर नियंत्रण बहुत महत्वपूर्ण था।'],
  ['Lakshmibai is remembered for active leadership during a period when political authority was being violently contested.','लक्ष्मीबाई को उस समय सक्रिय नेतृत्व के लिए याद किया जाता है जब राजनीतिक सत्ता को लेकर तीव्र संघर्ष चल रहा था।'],
  ['Biographical writing should distinguish contemporary evidence from later patriotic literature and popular retellings.','जीवनी लेखन में समकालीन प्रमाण, बाद के देशभक्ति साहित्य और लोकप्रिय पुनर्कथन को अलग पहचानना चाहिए।'],
  ['The study of the uprising also requires attention to communication, supplies, local alliances and the movement of forces between towns.','विद्रोह के अध्ययन में संचार, रसद, स्थानीय गठबंधन और नगरों के बीच सैन्य दलों की आवाजाही पर भी ध्यान देना होता है।'],
  ['Monuments and museums preserve public memory, while archives help test which details can be supported by documentary evidence.','स्मारक और संग्रहालय जन स्मृति को सुरक्षित रखते हैं, जबकि अभिलेखागार यह जाँचने में मदद करते हैं कि कौन-सी बात दस्तावेजी प्रमाण से समर्थित है।'],
  ['A careful account can recognise courage without losing sight of the uncertainty and hardship faced by civilians during war.','सावधानी से लिखा विवरण साहस को स्वीकार करते हुए युद्ध के दौरान आम लोगों की अनिश्चितता और कठिनाइयों को भी नजरअंदाज नहीं करता।'],
  ['Different regions experienced the uprising in different ways, which is why one local story cannot represent the entire event.','विद्रोह का अनुभव अलग-अलग क्षेत्रों में भिन्न था, इसलिए किसी एक स्थानीय कथा से पूरी घटना का प्रतिनिधित्व नहीं किया जा सकता।'],
  ['Rani Lakshmibai remains important in history because her life became linked with both a specific regional struggle and a wider national memory.','रानी लक्ष्मीबाई इतिहास में महत्वपूर्ण हैं क्योंकि उनका जीवन एक विशिष्ट क्षेत्रीय संघर्ष और व्यापक राष्ट्रीय स्मृति दोनों से जुड़ गया।']
 ]},
 {key:'public-library',en:'The Public Library as a Working Community Space',hi:'सार्वजनिक पुस्तकालय एक सक्रिय सामुदायिक स्थान',facts:[
  ['A public library serves readers of different ages, educational levels and interests, so its collection should not be planned for only one group.','सार्वजनिक पुस्तकालय अलग-अलग आयु, शिक्षा स्तर और रुचि के पाठकों की सेवा करता है, इसलिए उसका संग्रह केवल एक समूह के लिए नहीं होना चाहिए।'],
  ['A useful catalogue helps a reader locate a book without searching every shelf.','उपयोगी सूची पाठक को हर अलमारी देखने के बजाय पुस्तक जल्दी खोजने में मदद करती है।'],
  ['Newspapers, reference books, competitive examination material and local history can all have a place in a balanced collection.','समाचारपत्र, संदर्भ पुस्तकें, प्रतियोगी परीक्षा सामग्री और स्थानीय इतिहास संतुलित संग्रह का हिस्सा हो सकते हैं।'],
  ['Quiet reading space matters, but a modern library may also provide digital access, group learning and information assistance.','शांत अध्ययन स्थान महत्वपूर्ण है, लेकिन आधुनिक पुस्तकालय डिजिटल पहुँच, समूह अध्ययन और सूचना सहायता भी दे सकता है।'],
  ['Damaged books should be repaired or withdrawn through a record process instead of disappearing from shelves without explanation.','क्षतिग्रस्त पुस्तकों की मरम्मत या रिकॉर्ड के साथ निष्कासन होना चाहिए, वे बिना जानकारी के अलमारी से गायब नहीं होनी चाहिए।'],
  ['Local language material can make a library more useful to readers who are not comfortable with a second language.','स्थानीय भाषा की सामग्री उन पाठकों के लिए पुस्तकालय को अधिक उपयोगी बनाती है जो दूसरी भाषा में सहज नहीं हैं।'],
  ['Reading programmes work better when they invite participation rather than treating attendance as a formal requirement.','पठन कार्यक्रम तब अधिक प्रभावी होते हैं जब वे भागीदारी को प्रोत्साहित करें, केवल औपचारिक उपस्थिति न बन जाएँ।'],
  ['Libraries can preserve local documents, photographs and oral-history notes when basic archival care is available.','मूलभूत अभिलेखीय व्यवस्था होने पर पुस्तकालय स्थानीय दस्तावेज, चित्र और मौखिक इतिहास के नोट भी सुरक्षित रख सकते हैं।'],
  ['Internet access is valuable, yet staff still need rules for privacy, safe browsing and fair use of limited computers.','इंटरनेट सुविधा उपयोगी है, लेकिन गोपनीयता, सुरक्षित ब्राउज़िंग और सीमित कंप्यूटरों के न्यायपूर्ण उपयोग के नियम भी जरूरी हैं।'],
  ['A simple issue register shows which subjects are popular and which books may need replacement copies.','सरल निर्गमन पंजी से पता चलता है कि कौन-से विषय लोकप्रिय हैं और किन पुस्तकों की अतिरिक्त प्रतियाँ आवश्यक हो सकती हैं।'],
  ['Good lighting, ventilation and accessible furniture can determine whether readers remain comfortable for a long study session.','अच्छी रोशनी, वेंटिलेशन और उपयोगी फर्नीचर तय करते हैं कि पाठक लंबे अध्ययन सत्र में कितना सहज रहेंगे।'],
  ['A library becomes valuable when people trust that it will remain open, organised and responsive to changing learning needs.','पुस्तकालय तब मूल्यवान बनता है जब लोगों को भरोसा हो कि वह नियमित खुलेगा, व्यवस्थित रहेगा और बदलती अध्ययन आवश्यकताओं के अनुसार काम करेगा।']
 ]},
 {key:'disaster',en:'District Administration During Flood and Heat Emergencies',hi:'बाढ़ और गर्मी की आपदा में जिला प्रशासन',facts:[
  ['District emergency planning brings together weather information, local reports, transport, health services and relief arrangements.','जिला आपदा योजना मौसम सूचना, स्थानीय रिपोर्ट, परिवहन, स्वास्थ्य सेवा और राहत व्यवस्था को एक साथ जोड़ती है।'],
  ['Flood risk changes quickly when heavy rain occurs upstream, so river level and local drainage both need attention.','ऊपरी क्षेत्र में तेज वर्षा होने पर बाढ़ का जोखिम तेजी से बदल सकता है, इसलिए नदी स्तर और स्थानीय जल निकासी दोनों पर ध्यान जरूरी है।'],
  ['Relief centres need drinking water, toilets, basic health support, lighting and a reliable record of the people staying there.','राहत केंद्रों में पेयजल, शौचालय, प्राथमिक स्वास्थ्य सहायता, रोशनी और वहाँ ठहरे लोगों का भरोसेमंद रिकॉर्ड आवश्यक है।'],
  ['Warnings are effective only when people understand what action to take and where they can go for help.','चेतावनी तभी प्रभावी होती है जब लोगों को स्पष्ट हो कि क्या करना है और सहायता के लिए कहाँ जाना है।'],
  ['During a heat wave, work schedules, drinking water, shaded areas and health advice can reduce avoidable illness.','लू के दौरान कार्य समय, पेयजल, छायादार स्थान और स्वास्थ्य सलाह से रोकी जा सकने वाली बीमारियाँ कम की जा सकती हैं।'],
  ['Hospitals and ambulance services need backup plans because emergencies can also disrupt electricity and roads.','अस्पताल और एंबुलेंस सेवाओं को वैकल्पिक योजना चाहिए क्योंकि आपदा बिजली और सड़क दोनों को प्रभावित कर सकती है।'],
  ['Rumours spread quickly during a crisis, making verified public communication as important as physical relief.','संकट के समय अफवाहें तेजी से फैलती हैं, इसलिए सत्यापित सार्वजनिक सूचना भी भौतिक राहत जितनी महत्वपूर्ण होती है।'],
  ['A control room should record the source, time and status of each serious complaint so that follow-up is possible.','नियंत्रण कक्ष में प्रत्येक गंभीर सूचना का स्रोत, समय और स्थिति दर्ज होनी चाहिए ताकि आगे की कार्रवाई की जा सके।'],
  ['After an emergency, damage assessment helps distinguish immediate relief needs from longer reconstruction work.','आपदा के बाद क्षति आकलन तत्काल राहत की आवश्यकता और लंबे पुनर्निर्माण कार्य में अंतर स्पष्ट करता है।'],
  ['Schools, community halls and public buildings are often used as temporary facilities, so their basic safety should be known in advance.','विद्यालय, सामुदायिक भवन और सार्वजनिक इमारतें अस्थायी सुविधा के रूप में उपयोग होती हैं, इसलिए उनकी मूल सुरक्षा पहले से जानी जानी चाहिए।'],
  ['Local volunteers can be valuable when they receive clear tasks and work through an organised coordination point.','स्थानीय स्वयंसेवक तब अधिक उपयोगी होते हैं जब उन्हें स्पष्ट कार्य मिले और वे संगठित समन्वय केंद्र के माध्यम से काम करें।'],
  ['Good disaster management combines preparation, timely action, accurate records and a review of what should improve before the next season.','अच्छा आपदा प्रबंधन तैयारी, समय पर कार्रवाई, सही अभिलेख और अगले मौसम से पहले सुधार की समीक्षा को जोड़ता है।']
 ]},
 {key:'irrigation',en:'Irrigation, Soil and the Decisions of a Farming Season',hi:'सिंचाई, मिट्टी और खेती के मौसम के निर्णय',facts:[
  ['A farmer’s irrigation plan depends on crop type, soil, rainfall, water availability and the stage of plant growth.','किसान की सिंचाई योजना फसल, मिट्टी, वर्षा, जल उपलब्धता और पौधे की वृद्धि के चरण पर निर्भर करती है।'],
  ['More water is not always better because waterlogging can reduce air in the soil and damage roots.','अधिक पानी हमेशा लाभदायक नहीं होता क्योंकि जलभराव मिट्टी में हवा कम कर सकता है और जड़ों को नुकसान पहुँचा सकता है।'],
  ['Canals, tube wells, ponds and micro-irrigation systems each have different costs and maintenance needs.','नहर, नलकूप, तालाब और सूक्ष्म सिंचाई प्रणालियों की लागत तथा रखरखाव की आवश्यकताएँ अलग होती हैं।'],
  ['A field channel that leaks or breaks may reduce supply to farms located at the end of the distribution line.','खेत की नाली में रिसाव या टूट-फूट से वितरण लाइन के अंतिम खेतों तक पानी कम पहुँच सकता है।'],
  ['Soil moisture checks can prevent unnecessary irrigation when the surface looks dry but lower layers still hold water.','मिट्टी की नमी जाँचने से अनावश्यक सिंचाई रोकी जा सकती है, क्योंकि ऊपर की सतह सूखी दिखने पर भी नीचे नमी रह सकती है।'],
  ['Crop diversification can reduce risk when rainfall, market prices or pest conditions change unexpectedly.','वर्षा, बाजार मूल्य या कीट परिस्थिति अचानक बदलने पर फसल विविधीकरण जोखिम कम कर सकता है।'],
  ['Farm records help compare seed, fertiliser, labour, irrigation and yield across seasons.','कृषि अभिलेख अलग-अलग मौसमों में बीज, उर्वरक, श्रम, सिंचाई और उत्पादन की तुलना करने में मदद करते हैं।'],
  ['Weather forecasts are useful for planning, but a farmer still needs to observe local field conditions.','मौसम पूर्वानुमान योजना के लिए उपयोगी है, फिर भी किसान को स्थानीय खेत की स्थिति का निरीक्षण करना पड़ता है।'],
  ['Community management becomes important when several farms depend on the same pond, canal outlet or groundwater source.','जब कई खेत एक ही तालाब, नहर निकास या भूजल स्रोत पर निर्भर हों तो सामुदायिक प्रबंधन महत्वपूर्ण हो जाता है।'],
  ['Efficient irrigation saves energy as well as water when pumping time is reduced.','कुशल सिंचाई से पानी के साथ ऊर्जा भी बचती है क्योंकि पंप चलाने का समय कम हो जाता है।'],
  ['Extension advice is most useful when general recommendations are adapted to local soil and crop conditions.','कृषि सलाह तब अधिक उपयोगी होती है जब सामान्य सुझाव स्थानीय मिट्टी और फसल परिस्थिति के अनुसार अपनाए जाएँ।'],
  ['A stable farming season is usually the result of many small decisions rather than one dramatic intervention.','स्थिर कृषि मौसम अक्सर किसी एक बड़े उपाय के बजाय अनेक छोटे और सही निर्णयों का परिणाम होता है।']
 ]},
 {key:'postal-service',en:'From Letters to Logistics: The Changing Postal Network',hi:'पत्र से पार्सल तक बदलता डाक नेटवर्क',facts:[
  ['A postal network connects addresses through collection, sorting, transport and final delivery.','डाक नेटवर्क संग्रह, छँटाई, परिवहन और अंतिम वितरण के माध्यम से पते जोड़ता है।'],
  ['Correct pin codes and readable addresses reduce the chance that an article will be sent to the wrong sorting route.','सही पिन कोड और स्पष्ट पता डाक वस्तु के गलत छँटाई मार्ग पर जाने की संभावना कम करते हैं।'],
  ['Registered and tracked services create a chain of recorded events that can help trace an item.','पंजीकृत और ट्रैक की जाने वाली सेवाएँ दर्ज घटनाओं की शृंखला बनाती हैं जिससे वस्तु का पता लगाने में मदद मिलती है।'],
  ['Rural post offices often provide services beyond letters, including savings, payments and access points for public schemes.','ग्रामीण डाकघर पत्र के अलावा बचत, भुगतान और सार्वजनिक योजनाओं की पहुँच जैसी सेवाएँ भी दे सकते हैं।'],
  ['Parcel growth has increased the importance of packaging, weight, scanning and route planning.','पार्सल बढ़ने से पैकिंग, वजन, स्कैनिंग और मार्ग योजना का महत्व बढ़ा है।'],
  ['Digital messages reduced some traditional correspondence, but physical delivery remains essential for many documents and goods.','डिजिटल संदेशों से पारंपरिक पत्राचार का कुछ हिस्सा कम हुआ, फिर भी अनेक दस्तावेज और वस्तुओं के लिए भौतिक वितरण आवश्यक है।'],
  ['A sorting error discovered early is easier to correct than one noticed after an item has travelled across several centres.','छँटाई की गलती जल्दी पकड़ में आए तो उसे ठीक करना आसान है, कई केंद्र पार करने के बाद समस्या बढ़ जाती है।'],
  ['Delivery staff need accurate local knowledge because street names, landmarks and house numbering may not always be consistent.','वितरण कर्मचारियों को स्थानीय जानकारी की जरूरत होती है क्योंकि सड़क नाम, पहचान बिंदु और मकान संख्या हर जगह समान रूप से स्पष्ट नहीं होते।'],
  ['Sensitive documents should be handled in ways that protect identity and prevent casual access.','संवेदनशील दस्तावेज इस तरह संभाले जाने चाहिए कि पहचान सुरक्षित रहे और अनावश्यक पहुँच न हो।'],
  ['Customer complaints are easier to resolve when booking receipts and tracking events are preserved.','बुकिंग रसीद और ट्रैकिंग विवरण सुरक्षित हों तो ग्राहक शिकायत का समाधान आसान होता है।'],
  ['Modern postal work combines old strengths of physical reach with software, scanning and network logistics.','आधुनिक डाक कार्य भौतिक पहुँच की पुरानी शक्ति को सॉफ्टवेयर, स्कैनिंग और नेटवर्क लॉजिस्टिक्स के साथ जोड़ता है।'],
  ['The usefulness of the postal system depends on reliability, reach and confidence that an article will be handled as recorded.','डाक व्यवस्था की उपयोगिता भरोसेमंद सेवा, व्यापक पहुँच और दर्ज प्रक्रिया के अनुसार वस्तु संभाले जाने के विश्वास पर निर्भर करती है।']
 ]},
 {key:'railway',en:'A Railway Station as a System of Coordinated Work',hi:'रेलवे स्टेशन एक समन्वित कार्य प्रणाली',facts:[
  ['A railway station brings together train movement, passenger information, ticketing, platforms, security and basic public facilities.','रेलवे स्टेशन पर ट्रेन संचालन, यात्री सूचना, टिकट, प्लेटफॉर्म, सुरक्षा और मूल सार्वजनिक सुविधाएँ एक साथ काम करती हैं।'],
  ['A delay affects more than one train when platforms, crew or connecting services are shared.','प्लेटफॉर्म, चालक दल या संपर्क सेवाएँ साझा हों तो एक देरी का असर कई ट्रेनों पर पड़ सकता है।'],
  ['Clear announcements are important because a last-minute platform change can confuse elderly passengers and families with luggage.','स्पष्ट घोषणा जरूरी है क्योंकि अंतिम समय का प्लेटफॉर्म परिवर्तन बुजुर्ग यात्रियों और सामान वाले परिवारों को भ्रमित कर सकता है।'],
  ['Station records help staff trace incidents, maintenance needs and repeated passenger complaints.','स्टेशन अभिलेख घटनाओं, रखरखाव की जरूरत और बार-बार आने वाली यात्री शिकायतों को समझने में मदद करते हैं।'],
  ['Crowd management becomes especially important during festivals, examinations and sudden service disruption.','त्योहार, परीक्षाएँ और अचानक सेवा बाधित होने पर भीड़ प्रबंधन विशेष रूप से महत्वपूर्ण हो जाता है।'],
  ['Foot overbridges, lifts, ramps and signs influence whether passengers can move safely between platforms.','फुट ओवरब्रिज, लिफ्ट, रैंप और संकेतक तय करते हैं कि यात्री प्लेटफॉर्मों के बीच कितनी सुरक्षित आवाजाही कर सकते हैं।'],
  ['Clean drinking water, toilets and waiting areas are basic services rather than decorative additions.','स्वच्छ पेयजल, शौचालय और प्रतीक्षालय सजावटी सुविधा नहीं बल्कि मूल सेवाएँ हैं।'],
  ['Lost-property handling requires a record that identifies when and where an item was found and how it was returned.','खोई वस्तु के प्रबंधन में यह दर्ज होना चाहिए कि वस्तु कब और कहाँ मिली तथा उसे किस प्रक्रिया से लौटाया गया।'],
  ['Digital display boards are useful only when the information feeding them is current and consistent with announcements.','डिजिटल डिस्प्ले तभी उपयोगी है जब उसमें दी गई सूचना अद्यतन हो और घोषणाओं से मेल खाती हो।'],
  ['Safety depends on routine discipline, including keeping tracks clear and following authorised movement procedures.','सुरक्षा नियमित अनुशासन पर निर्भर करती है, जिसमें ट्रैक साफ रखना और अधिकृत संचालन प्रक्रिया का पालन शामिल है।'],
  ['Passenger service improves when staff can answer common questions quickly without sending people from one counter to another.','यात्री सेवा तब बेहतर होती है जब सामान्य प्रश्नों का उत्तर जल्दी मिले और लोगों को एक काउंटर से दूसरे पर न भेजना पड़े।'],
  ['A station works well when many small tasks are coordinated before a problem becomes visible to passengers.','स्टेशन तब अच्छी तरह चलता है जब अनेक छोटे कार्य समस्या यात्रियों को दिखाई देने से पहले ही समन्वित ढंग से पूरे हो जाएँ।']
 ]},
 {key:'archives',en:'How Archives Turn Old Records into Usable History',hi:'अभिलेखागार पुराने दस्तावेजों को उपयोगी इतिहास में कैसे बदलता है',facts:[
  ['Archives preserve records created by offices, institutions and individuals so that evidence survives beyond immediate administrative use.','अभिलेखागार कार्यालयों, संस्थाओं और व्यक्तियों द्वारा बनाए गए दस्तावेज सुरक्षित रखता है ताकि तत्काल प्रशासनिक उपयोग के बाद भी प्रमाण उपलब्ध रहे।'],
  ['A file without dates, creator information or an identifiable series can be difficult to interpret many years later.','तिथि, निर्माता या स्पष्ट शृंखला के बिना किसी फाइल को कई वर्ष बाद समझना कठिन हो सकता है।'],
  ['Catalogues and finding aids allow researchers to locate relevant material without opening every box.','सूची और खोज सहायक साधन शोधकर्ता को हर डिब्बा खोले बिना संबंधित सामग्री खोजने में मदद करते हैं।'],
  ['Paper is damaged by moisture, insects, heat, dust and careless handling, so storage conditions matter.','कागज नमी, कीट, गर्मी, धूल और लापरवाह उपयोग से क्षतिग्रस्त होता है, इसलिए भंडारण की स्थिति महत्वपूर्ण है।'],
  ['Digitisation improves access, but a scan should still preserve a link to the original record and its description.','डिजिटलीकरण पहुँच बढ़ाता है, लेकिन स्कैन को मूल अभिलेख और उसके विवरण से जुड़ा रहना चाहिए।'],
  ['Not every old document can be opened freely because privacy, legal restrictions or fragile condition may limit access.','हर पुराना दस्तावेज स्वतंत्र रूप से नहीं खोला जा सकता क्योंकि गोपनीयता, कानूनी प्रतिबंध या नाजुक स्थिति पहुँच सीमित कर सकती है।'],
  ['Historians compare records from different sources because one file may reflect the viewpoint of only one office or person.','इतिहासकार अलग-अलग स्रोतों के अभिलेखों की तुलना करते हैं क्योंकि एक फाइल केवल किसी एक कार्यालय या व्यक्ति का दृष्टिकोण दिखा सकती है।'],
  ['Photographs need captions and dates; otherwise a valuable image may become almost impossible to identify later.','चित्रों के साथ विवरण और तिथि आवश्यक है, अन्यथा मूल्यवान फोटो को बाद में पहचानना लगभग असंभव हो सकता है।'],
  ['Oral histories can add voices missing from official files, but interviews also need context and careful documentation.','मौखिक इतिहास सरकारी फाइलों में अनुपस्थित आवाजें जोड़ सकता है, लेकिन साक्षात्कार को भी संदर्भ और सावधानी से दर्ज करने की आवश्यकता होती है।'],
  ['A preservation decision balances historical value, physical condition, available space and legal requirements.','संरक्षण का निर्णय ऐतिहासिक महत्व, भौतिक स्थिति, उपलब्ध स्थान और कानूनी आवश्यकता के बीच संतुलन बनाता है।'],
  ['Good archives make evidence discoverable without pretending that every gap in the historical record can be filled.','अच्छा अभिलेखागार साक्ष्य को खोजने योग्य बनाता है, लेकिन यह दावा नहीं करता कि इतिहास के हर खाली स्थान को भरा जा सकता है।'],
  ['The careful work of naming, arranging and preserving records is what allows later generations to ask new questions about the past.','अभिलेखों को नाम देने, व्यवस्थित करने और सुरक्षित रखने का सावधान कार्य ही आने वाली पीढ़ियों को अतीत से नए प्रश्न पूछने का अवसर देता है।']
 ]},
 {key:'digital-service',en:'Digital Public Services and the Importance of Accurate Records',hi:'डिजिटल जन सेवाएँ और सही अभिलेख का महत्व',facts:[
  ['Digital public services can reduce travel and waiting time when forms, status updates and certificates are available through reliable systems.','भरोसेमंद प्रणाली से आवेदन, स्थिति और प्रमाणपत्र उपलब्ध हों तो डिजिटल जन सेवाएँ यात्रा और प्रतीक्षा समय कम कर सकती हैं।'],
  ['A fast portal does not solve a problem if the underlying name, date or address is entered incorrectly.','यदि मूल नाम, तिथि या पता गलत दर्ज हो तो तेज पोर्टल भी समस्या का समाधान नहीं कर सकता।'],
  ['Identity information should be collected only for a clear purpose and protected from unnecessary access.','पहचान संबंधी जानकारी केवल स्पष्ट उद्देश्य के लिए ली जानी चाहिए और अनावश्यक पहुँच से सुरक्षित रखी जानी चाहिए।'],
  ['Help centres remain important for citizens who have limited internet access or difficulty understanding online forms.','सीमित इंटरनेट पहुँच या ऑनलाइन फॉर्म समझने में कठिनाई वाले नागरिकों के लिए सहायता केंद्र अभी भी महत्वपूर्ण हैं।'],
  ['Status messages should use simple language so that a user knows whether an application is pending, rejected or waiting for correction.','स्थिति संदेश सरल भाषा में होने चाहिए ताकि उपयोगकर्ता समझ सके कि आवेदन लंबित, अस्वीकृत या सुधार की प्रतीक्षा में है।'],
  ['Audit logs help identify when a record was changed and which authorised account made the change.','ऑडिट लॉग यह पहचानने में मदद करते हैं कि अभिलेख कब बदला और किस अधिकृत खाते ने बदलाव किया।'],
  ['Backup systems matter because public records should not disappear after a hardware failure or software update.','बैकअप जरूरी है क्योंकि हार्डवेयर खराबी या सॉफ्टवेयर अपडेट के बाद सार्वजनिक अभिलेख गायब नहीं होने चाहिए।'],
  ['A secure system separates ordinary users, operators and administrators according to the work each role needs to perform.','सुरक्षित प्रणाली सामान्य उपयोगकर्ता, ऑपरेटर और प्रशासक को उनके आवश्यक कार्य के अनुसार अलग अधिकार देती है।'],
  ['Training should cover both software use and the judgment required to verify documents before data entry.','प्रशिक्षण में सॉफ्टवेयर उपयोग के साथ डेटा दर्ज करने से पहले दस्तावेज जाँचने की समझ भी शामिल होनी चाहिए।'],
  ['Citizen feedback can reveal repeated problems that are not obvious from technical error logs alone.','नागरिक प्रतिक्रिया ऐसी बार-बार आने वाली समस्याएँ दिखा सकती है जो केवल तकनीकी त्रुटि लॉग से स्पष्ट नहीं होतीं।'],
  ['Accessible design helps people using small screens, assistive technology or slower connections.','सुगम डिजाइन छोटे स्क्रीन, सहायक तकनीक या धीमे इंटरनेट का उपयोग करने वाले लोगों के लिए सेवा बेहतर बनाता है।'],
  ['The best digital service combines convenience with verification, privacy, clear responsibility and a workable offline support route.','अच्छी डिजिटल सेवा सुविधा के साथ सत्यापन, गोपनीयता, स्पष्ट जिम्मेदारी और व्यावहारिक ऑफलाइन सहायता मार्ग को जोड़ती है।']
 ]}
];

const OPEN_EN=[
 'A useful way to understand the subject is to look at how it works in ordinary life rather than treating it as a collection of slogans.',
 'The subject becomes clearer when records, people, places and practical decisions are considered together.',
 'In everyday administration, small details often decide whether a system remains reliable or slowly becomes difficult to use.',
 'The topic appears simple at first, but its importance becomes visible when several connected tasks are examined in sequence.',
 'A careful account begins with the basic setting and then follows the people who must make the system work from day to day.'
];
const OPEN_HI=[
 'इस विषय को समझने का अच्छा तरीका यह है कि इसे केवल नारे या परिभाषा की तरह न देखकर रोजमर्रा के जीवन में उसके काम को देखा जाए।',
 'जब अभिलेख, लोग, स्थान और व्यावहारिक निर्णय एक साथ देखे जाते हैं तो विषय अधिक स्पष्ट हो जाता है।',
 'दैनिक प्रशासन में छोटे विवरण अक्सर तय करते हैं कि कोई व्यवस्था भरोसेमंद रहेगी या धीरे-धीरे कठिन होती जाएगी।',
 'पहली नजर में विषय सरल लगता है, लेकिन जुड़े हुए कार्य क्रम से देखने पर उसका वास्तविक महत्व सामने आता है।',
 'संतुलित विवरण मूल परिस्थिति से शुरू होकर उन लोगों के काम तक पहुँचता है जो रोज इस व्यवस्था को चलाते हैं।'
];
const BRIDGE_EN=[
 'This is why a written record should explain what was observed, what action was taken and what still remains pending.',
 'The practical lesson is not to rely on memory when a date, name, location or responsibility can be recorded clearly.',
 'A short delay in verification may be less costly than a quick decision based on incomplete information.',
 'People usually notice the final service, while much of the important work happens earlier in checking, arranging and coordinating details.',
 'A strong system therefore depends on routine discipline as much as it depends on large plans or new technology.',
 'When responsibility is shared, the record should still make it clear who will complete the next step and by when.',
 'Local experience is valuable, but it becomes more useful when it is combined with measurements, documents and follow-up.',
 'A good report avoids dramatic language and gives enough detail for another person to understand the situation later.',
 'Useful records keep the important sequence visible so that later checking does not depend on guesswork.',
 'When a difficulty appears repeatedly, the better response is to examine its cause instead of treating every case as isolated.',
 'Clear public information saves time because people can prepare the right document or action before they reach the service point.',
 'Regular review is valuable because a process can slowly become confusing even when each individual change seemed minor.'
];
const BRIDGE_HI=[
 'इसीलिए लिखित अभिलेख में यह स्पष्ट होना चाहिए कि क्या देखा गया, क्या कार्रवाई हुई और कौन-सा काम अभी बाकी है।',
 'व्यावहारिक सीख यह है कि तिथि, नाम, स्थान या जिम्मेदारी को स्पष्ट दर्ज किया जा सकता हो तो केवल स्मृति पर निर्भर नहीं रहना चाहिए।',
 'अधूरी जानकारी पर जल्दी निर्णय लेने से बेहतर है कि सत्यापन में थोड़ा अतिरिक्त समय लगाया जाए।',
 'लोग अंतिम सेवा को देखते हैं, जबकि महत्वपूर्ण काम अक्सर पहले ही जाँच, व्यवस्था और समन्वय के दौरान हो चुका होता है।',
 'इसलिए मजबूत व्यवस्था बड़े कार्यक्रम या नई तकनीक के साथ नियमित अनुशासन पर भी निर्भर करती है।',
 'जिम्मेदारी साझा हो तो भी अभिलेख में स्पष्ट होना चाहिए कि अगला कदम कौन और कब पूरा करेगा।',
 'स्थानीय अनुभव उपयोगी है, लेकिन माप, दस्तावेज और बाद की समीक्षा से जुड़ने पर उसका महत्व और बढ़ जाता है।',
 'अच्छी रिपोर्ट अतिशयोक्ति से बचती है और इतनी जानकारी देती है कि बाद में दूसरा व्यक्ति भी स्थिति समझ सके।',
 'उपयोगी अभिलेख महत्वपूर्ण क्रम को स्पष्ट रखते हैं ताकि बाद की जाँच अनुमान पर निर्भर न रहे।',
 'जब कोई कठिनाई बार बार सामने आए तो हर मामले को अलग मानने के बजाय उसके मूल कारण को समझना बेहतर होता है।',
 'स्पष्ट सार्वजनिक सूचना समय बचाती है क्योंकि लोग सेवा केंद्र पहुँचने से पहले सही दस्तावेज या आवश्यक कार्रवाई तैयार कर सकते हैं।',
 'नियमित समीक्षा जरूरी है क्योंकि छोटे बदलाव अलग अलग सही लगें फिर भी पूरी प्रक्रिया धीरे धीरे उलझ सकती है।'
];
const SUPPORT_EN=[
 'A reader should be able to follow the sequence without needing private knowledge that exists only in someone’s memory.',
 'The most convincing explanation connects a general principle with a practical example and then returns to the main point.',
 'Where evidence is incomplete, the responsible approach is to mark the uncertainty instead of filling the gap with confidence.',
 'Routine checking may appear slow, but it often prevents the repeated corrections that consume much more time later.',
 'People understand a service or historical event better when the account explains both the visible outcome and the work behind it.',
 'A useful description gives enough context to make the detail meaningful without turning the passage into a list of disconnected facts.',
 'When several sources describe the same subject, differences should be noticed rather than quietly forcing every account to agree.',
 'Good organisation allows a new person to continue the task even when the person who began it is no longer present.',
 'The quality of a record is tested when another reader can verify its meaning, sequence and purpose after some time has passed.',
 'Practical improvement usually begins by identifying one repeated weakness and correcting the routine that allows it to continue.',
 'Clear language does not make a subject less serious; it makes the important detail easier to check and remember.',
 'The final value of the work depends on whether the information remains accurate, accessible and understandable when it is needed again.'
];
const SUPPORT_HI=[
 'पाठक को क्रम समझने के लिए ऐसी निजी जानकारी पर निर्भर नहीं होना चाहिए जो केवल किसी एक व्यक्ति की स्मृति में हो।',
 'सबसे प्रभावी विवरण सामान्य सिद्धांत को व्यावहारिक उदाहरण से जोड़ता है और फिर मुख्य विषय पर वापस आता है।',
 'जहाँ प्रमाण अधूरा हो वहाँ खाली स्थान को आत्मविश्वास से भरने के बजाय अनिश्चितता को स्पष्ट दर्ज करना जिम्मेदार तरीका है।',
 'नियमित जाँच धीमी लग सकती है, लेकिन वह बाद में बार बार होने वाले सुधार और अतिरिक्त समय को रोक सकती है।',
 'किसी सेवा या ऐतिहासिक घटना को लोग तब बेहतर समझते हैं जब परिणाम के साथ उसके पीछे हुए कार्य का भी विवरण मिले।',
 'उपयोगी वर्णन इतना संदर्भ देता है कि तथ्य अर्थपूर्ण बने रहें और अनुच्छेद अलग अलग सूचनाओं की सूची न बन जाए।',
 'एक ही विषय पर कई स्रोत हों तो उनके अंतर को पहचानना चाहिए, सभी विवरणों को जबरन एक जैसा नहीं बनाना चाहिए।',
 'अच्छी व्यवस्था से नया व्यक्ति भी काम आगे बढ़ा सकता है, भले ही शुरुआत करने वाला कर्मचारी उस समय मौजूद न हो।',
 'अभिलेख की गुणवत्ता तब परखी जाती है जब कुछ समय बाद दूसरा पाठक उसके अर्थ, क्रम और उद्देश्य की पुष्टि कर सके।',
 'व्यावहारिक सुधार अक्सर किसी बार बार होने वाली कमजोरी को पहचानकर उस प्रक्रिया को ठीक करने से शुरू होता है जो उसे जारी रखती है।',
 'सरल भाषा विषय को कम गंभीर नहीं बनाती, बल्कि महत्वपूर्ण विवरण को जाँचने और याद रखने में मदद करती है।',
 'कार्य का अंतिम मूल्य इस बात पर निर्भर करता है कि जरूरत पड़ने पर सूचना सही, उपलब्ध और समझने योग्य बनी रहे।'
];
const CLOSE_EN=[
 'In the end, reliable public work is built through clear information, patient coordination and the habit of checking important details before a task is closed.',
 'The larger lesson is that lasting improvement usually comes from many correct routine decisions rather than one impressive announcement.',
 'For a typist, such passages are useful because they combine familiar language with the careful names, facts and sequences common in examination material.'
];
const CLOSE_HI=[
 'अंततः भरोसेमंद सार्वजनिक कार्य स्पष्ट सूचना, धैर्यपूर्ण समन्वय और काम बंद करने से पहले महत्वपूर्ण विवरण जाँचने की आदत से बनता है।',
 'व्यापक सीख यह है कि टिकाऊ सुधार अक्सर किसी एक बड़े घोषणा-पत्र से नहीं बल्कि लगातार लिए गए छोटे और सही निर्णयों से आता है।',
 'टाइपिंग अभ्यर्थी के लिए ऐसे अनुच्छेद उपयोगी हैं क्योंकि इनमें सामान्य भाषा के साथ परीक्षा में मिलने वाले तथ्य, नाम और क्रमबद्ध विवरण भी शामिल होते हैं।'
];


// Difficulty must feel different, not just carry a different label.
// Easy keeps short, direct sentences; Medium adds ordinary descriptive detail;
// Moderate-to-Hard adds denser administrative wording and occasional notation;
// Hard adds long connected clauses, records, dates, percentages and references.
const EASY_EN=[
 'The idea can be understood from a simple everyday example.',
 'People notice the result first, but the work begins much earlier.',
 'A clear record helps the next person understand what happened.',
 'Small mistakes are easier to correct when they are found early.',
 'The work becomes easier when each step is done in the right order.',
 'Good information saves time for both staff and the public.',
 'A simple check can prevent the same problem from returning again.',
 'Local people often know which difficulty appears most often.',
 'Clean records make later checking faster and more reliable.',
 'A short note is useful when it gives the correct name, place and date.',
 'Regular maintenance is usually easier than emergency repair.',
 'The best result comes when responsibility is clear from the beginning.',
 'People trust a service more when the process is easy to understand.',
 'A careful worker reads the source once more before closing the task.',
 'The same rule should be followed by everyone doing the same work.',
 'A useful report tells what happened without adding unnecessary claims.',
 'Facts become easier to remember when they are linked with a real place.',
 'The next step should be written clearly instead of being left to memory.',
 'A steady routine often solves more problems than a hurried response.',
 'The final record should be simple enough for another person to follow.'
];
const EASY_HI=[
 'इस बात को रोजमर्रा के एक सरल उदाहरण से समझा जा सकता है।',
 'लोग परिणाम पहले देखते हैं, लेकिन काम उससे काफी पहले शुरू हो जाता है।',
 'स्पष्ट अभिलेख से अगला व्यक्ति आसानी से समझ सकता है कि क्या हुआ था।',
 'छोटी गलती जल्दी मिल जाए तो उसे ठीक करना आसान होता है।',
 'हर कदम सही क्रम में हो तो काम अधिक सरल हो जाता है।',
 'सही जानकारी कर्मचारी और जनता दोनों का समय बचाती है।',
 'एक सामान्य जाँच वही समस्या दोबारा आने से रोक सकती है।',
 'स्थानीय लोग अक्सर जानते हैं कि कौन सी कठिनाई बार बार आती है।',
 'साफ अभिलेख बाद की जाँच को तेज और भरोसेमंद बनाते हैं।',
 'छोटी टिप्पणी तभी उपयोगी है जब नाम, स्थान और तिथि सही हों।',
 'नियमित रखरखाव अक्सर आपात मरम्मत से आसान होता है।',
 'जिम्मेदारी शुरू से स्पष्ट हो तो परिणाम बेहतर मिलता है।',
 'प्रक्रिया समझ में आए तो लोग सेवा पर अधिक भरोसा करते हैं।',
 'सावधान कर्मचारी काम बंद करने से पहले स्रोत को एक बार फिर पढ़ता है।',
 'एक ही काम करने वाले सभी लोगों को समान नियम मानना चाहिए।',
 'उपयोगी रिपोर्ट बिना अनावश्यक दावे के बताती है कि वास्तव में क्या हुआ।',
 'तथ्य किसी वास्तविक स्थान से जुड़ें तो उन्हें याद रखना आसान होता है।',
 'अगला कदम स्मृति पर छोड़ने के बजाय साफ शब्दों में लिखा जाना चाहिए।',
 'स्थिर प्रक्रिया अक्सर जल्दबाजी वाले उत्तर से अधिक समस्याएँ हल करती है।',
 'अंतिम अभिलेख इतना सरल होना चाहिए कि दूसरा व्यक्ति भी उसे समझ सके।'
];
const HARD_EN=[
 'The significance of the entry becomes clearer when chronology, responsibility and the supporting record are examined together rather than in isolation.',
 'Where two records appear inconsistent, the safer administrative course is to preserve both references, identify the discrepancy and record the basis of the final correction.',
 'A later review may depend on the exact sequence of events, so names, dates, measurements and quoted terms require more care than ordinary narrative text.',
 'The subject also shows how a routine decision can acquire legal, financial or historical importance when it becomes part of an official record.',
 'For this reason, a competent note distinguishes verified fact, reported information, pending action and personal inference instead of merging them into one statement.',
 'The value of the record is tested when a person unfamiliar with the original work can reconstruct the decision without relying on unwritten assumptions.'
];
const HARD_HI=[
 'प्रविष्टि का महत्व तब अधिक स्पष्ट होता है जब घटनाक्रम, जिम्मेदारी और सहायक अभिलेख को अलग अलग नहीं बल्कि एक साथ देखकर जाँचा जाए।',
 'दो अभिलेखों में अंतर मिले तो सुरक्षित प्रशासनिक तरीका दोनों संदर्भ सुरक्षित रखना, अंतर चिन्हित करना और अंतिम सुधार का आधार दर्ज करना है।',
 'बाद की समीक्षा घटनाओं के सही क्रम पर निर्भर कर सकती है, इसलिए नाम, तिथि, माप और उद्धृत शब्द सामान्य विवरण की तुलना में अधिक सावधानी चाहते हैं।',
 'यह विषय यह भी दिखाता है कि सामान्य निर्णय आधिकारिक अभिलेख का हिस्सा बनने पर कानूनी, वित्तीय या ऐतिहासिक महत्व प्राप्त कर सकता है।',
 'इसी कारण अच्छी टिप्पणी सत्यापित तथ्य, प्राप्त सूचना, लंबित कार्रवाई और व्यक्तिगत अनुमान को एक ही कथन में मिलाने के बजाय अलग रखती है।',
 'अभिलेख की वास्तविक उपयोगिता तब परखी जाती है जब मूल कार्य से अपरिचित व्यक्ति बिना मौखिक अनुमान के पूरे निर्णय क्रम को समझ सके।'
];


// Dynamic topic universe v5.
// The user-supplied examples (biography, historical places, village stories, court, railway, etc.)
// are categories, not a fixed daily topic list. A topic signature is built from several rotating
// dimensions so the same topic/angle combination is not reused once it has been published.
const BIO_PEOPLE=[
 ['apj-kalam','A. P. J. Abdul Kalam','ए. पी. जे. अब्दुल कलाम','science, engineering and public service','विज्ञान, अभियांत्रिकी और जन सेवा'],
 ['sardar-patel','Sardar Vallabhbhai Patel','सरदार वल्लभभाई पटेल','public leadership and national integration','जन नेतृत्व और राष्ट्रीय एकीकरण'],
 ['savitribai-phule','Savitribai Phule','सावित्रीबाई फुले','education and social reform','शिक्षा और सामाजिक सुधार'],
 ['br-ambedkar','B. R. Ambedkar','डॉ. भीमराव आंबेडकर','law, scholarship and constitutional work','विधि, अध्ययन और संवैधानिक कार्य'],
 ['cv-raman','C. V. Raman','सी. वी. रमन','scientific research and physics','वैज्ञानिक अनुसंधान और भौतिकी'],
 ['homi-bhabha','Homi J. Bhabha','होमी जे. भाभा','scientific institution building','वैज्ञानिक संस्थान निर्माण'],
 ['vikram-sarabhai','Vikram Sarabhai','विक्रम साराभाई','space science and institution building','अंतरिक्ष विज्ञान और संस्थान निर्माण'],
 ['verghese-kurien','Verghese Kurien','वर्गीज कुरियन','dairy development and cooperative management','दुग्ध विकास और सहकारी प्रबंधन'],
 ['ms-swaminathan','M. S. Swaminathan','एम. एस. स्वामीनाथन','agricultural science and food security','कृषि विज्ञान और खाद्य सुरक्षा'],
 ['rani-lakshmibai','Rani Lakshmibai','रानी लक्ष्मीबाई','the uprising of 1857 and regional resistance','1857 के विद्रोह और क्षेत्रीय प्रतिरोध'],
 ['kalpana-chawla','Kalpana Chawla','कल्पना चावला','space exploration and scientific aspiration','अंतरिक्ष अन्वेषण और वैज्ञानिक प्रेरणा'],
 ['dhyan-chand','Major Dhyan Chand','मेजर ध्यानचंद','Indian hockey and sporting discipline','भारतीय हॉकी और खेल अनुशासन']
];
const HERITAGE_PLACES=[
 ['sarnath','Sarnath','सारनाथ','Buddhist heritage, archaeology and museum records','बौद्ध विरासत, पुरातत्व और संग्रहालय अभिलेख'],
 ['nalanda','Nalanda','नालंदा','ancient learning, archaeology and conservation','प्राचीन शिक्षा, पुरातत्व और संरक्षण'],
 ['fatehpur-sikri','Fatehpur Sikri','फतेहपुर सीकरी','Mughal-era architecture and urban planning','मुगलकालीन स्थापत्य और नगर योजना'],
 ['sanchi','Sanchi','सांची','Buddhist monuments and conservation','बौद्ध स्मारक और संरक्षण'],
 ['hampi','Hampi','हम्पी','Vijayanagara heritage and landscape archaeology','विजयनगर विरासत और पुरातात्विक परिदृश्य'],
 ['konark','Konark Sun Temple','कोणार्क सूर्य मंदिर','temple architecture, stone craft and conservation','मंदिर स्थापत्य, पत्थर शिल्प और संरक्षण'],
 ['ajanta','Ajanta Caves','अजंता की गुफाएँ','rock-cut heritage, painting and preservation','शैलकृत विरासत, चित्रकला और संरक्षण'],
 ['ellora','Ellora Caves','एलोरा की गुफाएँ','rock-cut architecture and multi-period heritage','शैलकृत स्थापत्य और बहु-कालीन विरासत'],
 ['dholavira','Dholavira','धोलावीरा','Harappan archaeology, water systems and settlement planning','हड़प्पा पुरातत्व, जल व्यवस्था और बसावट योजना'],
 ['red-fort','Red Fort','लाल किला','Mughal architecture, public memory and conservation','मुगल स्थापत्य, जन स्मृति और संरक्षण'],
 ['agra-fort','Agra Fort','आगरा किला','fort architecture, imperial history and preservation','किला स्थापत्य, शाही इतिहास और संरक्षण'],
 ['jaipur-city','Historic Jaipur','ऐतिहासिक जयपुर','planned urban form, crafts and heritage management','योजनाबद्ध नगर रूप, शिल्प और विरासत प्रबंधन']
];
const SYSTEM_SUBJECTS=[
 ['high-court','High Court registry','उच्च न्यायालय रजिस्ट्री'],['district-office','district administration office','जिला प्रशासन कार्यालय'],
 ['railway','railway station operations','रेलवे स्टेशन संचालन'],['post-office','postal service','डाक सेवा'],
 ['hospital','district hospital','जिला अस्पताल'],['library','public library','सार्वजनिक पुस्तकालय'],
 ['archive','record archive','अभिलेखागार'],['water-supply','municipal water supply','नगर जलापूर्ति'],
 ['irrigation','irrigation department','सिंचाई विभाग'],['agri-market','agricultural market','कृषि मंडी'],
 ['weather-centre','weather observation centre','मौसम प्रेक्षण केंद्र'],['forest-office','forest field office','वन क्षेत्र कार्यालय'],
 ['bus-depot','public transport depot','सार्वजनिक परिवहन डिपो'],['school-office','school administration office','विद्यालय प्रशासन कार्यालय'],
 ['digital-centre','digital public service centre','डिजिटल जन सेवा केंद्र'],['disaster-room','district disaster control room','जिला आपदा नियंत्रण कक्ष']
];
const SCIENCE_SUBJECTS=[
 ['soil','soil health and field observation','मिट्टी की सेहत और खेत निरीक्षण'],['monsoon','monsoon observation and local planning','मानसून प्रेक्षण और स्थानीय योजना'],
 ['solar','solar energy in public facilities','सार्वजनिक संस्थानों में सौर ऊर्जा'],['cyber','everyday cyber safety','दैनिक साइबर सुरक्षा'],
 ['satellite','satellite mapping for public planning','सार्वजनिक योजना में उपग्रह मानचित्रण'],['waste','waste segregation and recycling','कचरा पृथक्करण और पुनर्चक्रण'],
 ['biodiversity','local biodiversity records','स्थानीय जैव विविधता अभिलेख'],['river','river monitoring and water quality','नदी निगरानी और जल गुणवत्ता'],
 ['health-data','public health data and reporting','जन स्वास्थ्य डेटा और रिपोर्टिंग'],['digital-record','digital records and backups','डिजिटल अभिलेख और बैकअप'],
 ['air-quality','air quality observation','वायु गुणवत्ता प्रेक्षण'],['rainwater','rainwater harvesting','वर्षा जल संचयन']
];
const HISTORY_SUBJECTS=[
 ['trade-routes','historic trade routes and market towns','ऐतिहासिक व्यापार मार्ग और बाजार नगर'],['inscriptions','inscriptions as historical evidence','शिलालेख ऐतिहासिक साक्ष्य के रूप में'],
 ['postal-history','the changing history of postal communication','डाक संचार का बदलता इतिहास'],['railway-history','the growth of railways and connected towns','रेलवे विकास और जुड़े नगर'],
 ['irrigation-history','historic irrigation works and local farming','ऐतिहासिक सिंचाई व्यवस्था और स्थानीय खेती'],['craft-history','traditional crafts and changing markets','पारंपरिक शिल्प और बदलते बाजार'],
 ['archives-history','archives and the reconstruction of local history','अभिलेखागार और स्थानीय इतिहास का पुनर्निर्माण'],['education-history','the growth of public education institutions','सार्वजनिक शिक्षा संस्थानों का विकास'],
 ['maps-history','old maps as sources of local history','पुराने मानचित्र स्थानीय इतिहास के स्रोत के रूप में'],['museum-history','museums, objects and public memory','संग्रहालय, वस्तुएँ और जन स्मृति']
];
const CURRENT_LITERACY=[
 ['verify-report','How a Current Affairs Report Is Verified','वर्तमान घटनाओं की रिपोर्ट का सत्यापन कैसे होता है'],
 ['official-update','Reading an Official Update Before Sharing It','साझा करने से पहले आधिकारिक सूचना पढ़ना'],
 ['weather-alert','Understanding a Weather Alert Without Rumours','अफवाह के बिना मौसम चेतावनी को समझना'],
 ['news-correction','How a News Error Is Corrected','समाचार की त्रुटि कैसे सुधारी जाती है'],
 ['public-notice','Checking Dates and Conditions in a Public Notice','सार्वजनिक सूचना में तिथि और शर्तों की जाँच'],
 ['source-check','Distinguishing a Source, a Claim and an Opinion','स्रोत, दावा और राय में अंतर समझना'],
 ['data-headline','Reading Numbers Behind a Headline','समाचार शीर्षक के पीछे के आँकड़े पढ़ना'],
 ['photo-context','Checking the Context of a Photo or Video','चित्र या वीडियो का संदर्भ जाँचना']
];
const STORY_SETTINGS=[
 ['dry-village','a village facing a long dry spell','लंबे सूखे से जूझता एक गाँव'],['pond-village','a village restoring an old pond','पुराने तालाब को सुधारता एक गाँव'],
 ['hill-road','a hill settlement after a blocked road','बंद सड़क के बाद का पहाड़ी गाँव'],['school-garden','a school garden during a hot summer','गर्मियों में विद्यालय का बगीचा'],
 ['river-bank','a settlement near a rising river','बढ़ती नदी के पास की बस्ती'],['weekly-market','a busy weekly village market','व्यस्त साप्ताहिक ग्रामीण बाजार'],
 ['forest-edge','a small settlement near a forest','जंगल के किनारे की छोटी बस्ती'],['post-route','a village on a difficult postal route','कठिन डाक मार्ग वाला गाँव']
];
const STORY_CHARACTERS=[
 ['student','a school student','एक विद्यार्थी'],['farmer','a small farmer','एक छोटा किसान'],['postman','a village postman','एक ग्रामीण डाकिया'],
 ['teacher','a school teacher','एक शिक्षक'],['potter','a local potter','एक स्थानीय कुम्हार'],['shopkeeper','a small shopkeeper','एक दुकानदार'],
 ['health-worker','a community health worker','एक सामुदायिक स्वास्थ्य कार्यकर्ता'],['forest-guard','a forest guard','एक वन रक्षक']
];
const STORY_CHALLENGES=[
 ['crow-water','a thirsty crow finding water near the courtyard','आँगन के पास पानी खोजता प्यासा कौआ'],['drought','a shortage of drinking water after weak rainfall','कम वर्षा के बाद पेयजल की कमी'],
 ['lost-letter','an important letter delivered to the wrong lane','गलत गली में पहुँचा महत्वपूर्ण पत्र'],['broken-bridge','a damaged small bridge affecting daily travel','आवागमन रोकता क्षतिग्रस्त छोटा पुल'],
 ['power-cut','a long power cut during a busy day','व्यस्त दिन में लंबी बिजली कटौती'],['storm','a sudden storm damaging trees and signs','अचानक आँधी से पेड़ और संकेतक क्षतिग्रस्त होना'],
 ['missing-register','a missing register that everyone needs','सबको आवश्यक एक रजिस्टर का गायब होना'],['injured-bird','an injured bird found near the school','विद्यालय के पास घायल पक्षी मिलना']
];
const ANGLES=[
 ['daily-life','daily life and practical decisions','दैनिक जीवन और व्यावहारिक निर्णय'],['records','records, dates and verification','अभिलेख, तिथियाँ और सत्यापन'],
 ['people','people, responsibility and coordination','लोग, जिम्मेदारी और समन्वय'],['change','change over time and its effects','समय के साथ बदलाव और उसका प्रभाव'],
 ['problem-solving','a problem, its cause and a workable response','समस्या, उसका कारण और व्यावहारिक समाधान'],['learning','what can be learned from the subject','विषय से मिलने वाली सीख'],
 ['public-service','public service and citizen experience','जन सेवा और नागरिक अनुभव'],['evidence','evidence, sources and careful interpretation','साक्ष्य, स्रोत और सावधान व्याख्या'],
 ['maintenance','maintenance, prevention and follow-up','रखरखाव, रोकथाम और अनुवर्ती कार्य'],['community','community participation and local knowledge','सामुदायिक भागीदारी और स्थानीय अनुभव']
];

const LENSES=[
 ['accuracy','accuracy and careful checking','शुद्धता और सावधान जाँच'],['access','access and ease of use','पहुँच और उपयोग की सरलता'],
 ['maintenance','maintenance and prevention','रखरखाव और रोकथाम'],['training','training and working habits','प्रशिक्षण और कार्य आदतें'],
 ['records','records and traceability','अभिलेख और खोजयोग्यता'],['community','community experience','सामुदायिक अनुभव'],
 ['technology','technology with human verification','मानवीय सत्यापन के साथ तकनीक'],['safety','safety and preparedness','सुरक्षा और तैयारी'],
 ['resources','limited resources and priorities','सीमित संसाधन और प्राथमिकताएँ'],['communication','clear communication','स्पष्ट संचार'],
 ['comparison','comparison across two situations','दो परिस्थितियों की तुलना'],['followup','follow-up after the first action','पहली कार्रवाई के बाद अनुवर्ती कार्य']
];
const STAGES=[
 ['start','at the beginning of a new working cycle','नए कार्य चक्र की शुरुआत में'],['busy','during a busy period','व्यस्त अवधि के दौरान'],
 ['review','during a routine review','नियमित समीक्षा के दौरान'],['handover','when work passes from one person to another','जब काम एक व्यक्ति से दूसरे को सौंपा जाता है'],
 ['season','before a seasonal change','मौसमी बदलाव से पहले'],['problem','after a repeated problem is noticed','बार-बार समस्या दिखने के बाद'],
 ['upgrade','after a small system improvement','छोटे व्यवस्था सुधार के बाद'],['field','while field information is being collected','जब क्षेत्रीय जानकारी एकत्र की जा रही हो'],
 ['public','when public use suddenly increases','जब सार्वजनिक उपयोग अचानक बढ़ जाए'],['audit','while an old record is being checked','जब पुराने अभिलेख की जाँच हो रही हो'],
 ['training','during staff training','कर्मचारी प्रशिक्षण के दौरान'],['recovery','while normal work is being restored after disruption','बाधा के बाद सामान्य काम बहाल करते समय']
];


function makeFactsForSystem(subjectEn,subjectHi,angleEn,angleHi){return [
 [`A useful account of ${subjectEn} begins with the people who use the service and the staff who keep it working every day.`,`${subjectHi} का उपयोगी विवरण उन लोगों से शुरू होता है जो सेवा लेते हैं और उन कर्मचारियों से जो इसे रोज चलाते हैं।`],
 [`The subject becomes clearer when ${angleEn} are considered together instead of as separate details.`,`${subjectHi} को समझते समय ${angleHi} को अलग-अलग नहीं बल्कि एक साथ देखना अधिक उपयोगी होता है।`],
 [`A clear register can record dates, complaints, pending work and the person responsible for the next action.`,`स्पष्ट पंजी में तिथि, शिकायत, लंबित कार्य और अगले कदम के जिम्मेदार व्यक्ति को दर्ज किया जा सकता है।`],
 [`Small delays often grow when the same information must be checked repeatedly because the first entry was incomplete.`,`पहली प्रविष्टि अधूरी हो तो वही जानकारी बार-बार जाँचनी पड़ती है और छोटी देरी बड़ी समस्या बन सकती है।`],
 [`People usually judge ${subjectEn} by the final service, although much of the important work happens earlier in checking and coordination.`,`लोग ${subjectHi} को अंतिम सेवा से आँकते हैं, जबकि महत्वपूर्ण काम अक्सर पहले ही जाँच और समन्वय में हो चुका होता है।`],
 [`Simple instructions reduce confusion when several counters, rooms or field teams are involved in one process.`,`एक ही प्रक्रिया में कई काउंटर, कक्ष या क्षेत्रीय दल जुड़े हों तो सरल निर्देश भ्रम कम करते हैं।`],
 [`A practical review should separate a verified fact from a complaint, an estimate and an action that is still pending.`,`व्यावहारिक समीक्षा में सत्यापित तथ्य, शिकायत, अनुमान और लंबित कार्रवाई को अलग-अलग दर्ज करना चाहिए।`],
 [`Maintenance is easier when repeated faults are recorded before they become emergency repairs.`,`बार-बार होने वाली खराबी पहले से दर्ज हो तो आपात मरम्मत की स्थिति आने से पहले रखरखाव आसान हो जाता है।`],
 [`Digital tools can make search faster, but they do not remove the need to enter names, dates and references accurately.`,`डिजिटल साधन खोज तेज कर सकते हैं, पर नाम, तिथि और संदर्भ सही दर्ज करने की आवश्यकता समाप्त नहीं होती।`],
 [`Public confidence improves when a person can understand what has happened, what remains pending and when the next update is expected.`,`जब व्यक्ति समझ सके कि क्या हुआ, क्या बाकी है और अगली जानकारी कब मिलेगी तो जन विश्वास बढ़ता है।`],
 [`The best improvement is often a small change in routine that prevents the same error from returning.`,`सबसे उपयोगी सुधार अक्सर प्रक्रिया का छोटा बदलाव होता है जो एक ही गलती को दोबारा होने से रोकता है।`],
 [`A final check of ${subjectEn} should leave enough information for another worker to continue the task without guessing.`,`${subjectHi} की अंतिम जाँच में इतना स्पष्ट विवरण होना चाहिए कि दूसरा कर्मचारी बिना अनुमान लगाए काम आगे बढ़ा सके।`]
]}
function makeFactsForBio(nameEn,nameHi,fieldEn,fieldHi,angleEn,angleHi){return [
 [`A balanced biography of ${nameEn} should connect the person with ${fieldEn} while keeping dates, institutions and achievements in their proper context.`,`${nameHi} की संतुलित जीवनी में ${fieldHi} से उनके संबंध को तिथि, संस्था और उपलब्धि के सही संदर्भ के साथ समझना चाहिए।`],
 [`The most useful account separates well documented events from later stories that may have grown around a famous public figure.`,`उपयोगी विवरण प्रमाणित घटनाओं को बाद में प्रचलित हुई कथाओं से अलग रखता है।`],
 [`Early education, working habits and the institutions around ${nameEn} help explain how a public career developed over time.`,`${nameHi} की शिक्षा, कार्य आदतें और उनसे जुड़ी संस्थाएँ यह समझने में मदद करती हैं कि सार्वजनिक जीवन समय के साथ कैसे विकसित हुआ।`],
 [`A single quotation cannot represent an entire life, so a biography should compare several reliable records.`,`एक उद्धरण पूरे जीवन का प्रतिनिधित्व नहीं कर सकता, इसलिए जीवनी में कई भरोसेमंद अभिलेखों की तुलना उपयोगी होती है।`],
 [`The angle of ${angleEn} can reveal parts of the story that are missed when only famous achievements are listed.`,`${angleHi} का दृष्टिकोण उन पहलुओं को सामने ला सकता है जो केवल प्रसिद्ध उपलब्धियाँ गिनाने से छूट जाते हैं।`],
 [`Institutions, colleagues and historical circumstances also shape the work for which ${nameEn} later becomes remembered.`,`संस्थाएँ, सहयोगी और ऐतिहासिक परिस्थितियाँ भी उस कार्य को आकार देती हैं जिसके लिए ${nameHi} को बाद में याद किया जाता है।`],
 [`A careful note should preserve the difference between a confirmed date, an approximate period and an uncertain claim.`,`सावधान टिप्पणी में निश्चित तिथि, अनुमानित अवधि और अनिश्चित दावे के बीच अंतर बनाए रखना चाहिए।`],
 [`Public memory often simplifies a complicated career, while archives and biographies can restore missing detail.`,`जन स्मृति जटिल जीवन को सरल बना देती है, जबकि अभिलेख और जीवनी छूटे हुए विवरण वापस ला सकते हैं।`],
 [`The influence of ${nameEn} can be studied through institutions, policies, research, teaching, public work or later generations, depending on the field.`,`${nameHi} के प्रभाव का अध्ययन क्षेत्र के अनुसार संस्था, नीति, अनुसंधान, शिक्षण, जन कार्य या बाद की पीढ़ियों के माध्यम से किया जा सकता है।`],
 [`Good biographical writing avoids turning respect into exaggeration because factual precision makes an achievement easier to understand.`,`अच्छी जीवनी सम्मान को अतिशयोक्ति में नहीं बदलती क्योंकि तथ्यात्मक शुद्धता उपलब्धि को अधिक स्पष्ट बनाती है।`],
 [`Readers benefit when a biography explains both the result of an achievement and the years of work that made it possible.`,`जीवनी में उपलब्धि के परिणाम के साथ उसे संभव बनाने वाले वर्षों के काम का वर्णन भी उपयोगी होता है।`],
 [`The lasting lesson is to study ${nameEn} through evidence, context and contribution rather than through slogans alone.`,`स्थायी सीख यह है कि ${nameHi} को केवल नारों से नहीं बल्कि साक्ष्य, संदर्भ और योगदान के आधार पर समझा जाए।`]
]}
function makeFactsForPlace(nameEn,nameHi,descEn,descHi,angleEn,angleHi){return [
 [`${nameEn} can be studied through ${descEn}, but the site is also shaped by the landscape, later repairs and the way visitors use it today.`,`${nameHi} का अध्ययन ${descHi} के माध्यम से किया जा सकता है, लेकिन स्थल के वर्तमान रूप पर भू-दृश्य, बाद की मरम्मत और आगंतुकों का उपयोग भी प्रभाव डालता है।`],
 [`A historical place becomes easier to understand when a visitor distinguishes the original structure from later additions and conservation work.`,`ऐतिहासिक स्थल को समझना आसान होता है जब मूल संरचना, बाद के निर्माण और संरक्षण कार्य में अंतर किया जाए।`],
 [`Maps, inscriptions, excavation reports, photographs and museum records can provide different kinds of evidence about the same place.`,`मानचित्र, शिलालेख, उत्खनन रिपोर्ट, चित्र और संग्रहालय अभिलेख एक ही स्थान के बारे में अलग प्रकार के साक्ष्य देते हैं।`],
 [`The angle of ${angleEn} helps connect the monument with the people who built, used, studied and protected it.`,`${angleHi} का दृष्टिकोण स्मारक को बनाने, उपयोग करने, अध्ययन करने और सुरक्षित रखने वाले लोगों से जोड़ता है।`],
 [`Crowd movement, weather, moisture and careless touching can slowly damage a site even when no single incident appears serious.`,`भीड़, मौसम, नमी और लापरवाह स्पर्श से स्थल धीरे-धीरे क्षतिग्रस्त हो सकता है, भले ही कोई एक घटना बड़ी न लगे।`],
 [`Conservation work needs records because later teams should know what material was repaired, when it was done and why.`,`संरक्षण कार्य में अभिलेख जरूरी हैं ताकि बाद की टीम जान सके कि किस भाग की मरम्मत कब और क्यों हुई।`],
 [`Local communities may remember a place through stories and customs that are different from the questions asked by archaeologists.`,`स्थानीय समुदाय किसी स्थल को ऐसी कथाओं और परंपराओं से याद कर सकते हैं जो पुरातत्वविदों के प्रश्नों से अलग हों।`],
 [`A responsible description should not fill every historical gap with certainty when the surviving evidence is incomplete.`,`जब उपलब्ध साक्ष्य अधूरे हों तो जिम्मेदार विवरण हर ऐतिहासिक खाली स्थान को निश्चित दावे से नहीं भरता।`],
 [`Visitor facilities, signs and pathways can protect heritage when they guide people without hiding the character of the site.`,`आगंतुक सुविधा, संकेतक और मार्ग विरासत की रक्षा कर सकते हैं यदि वे स्थल के स्वरूप को छिपाए बिना लोगों को सही दिशा दें।`],
 [`Digital models and photographs help documentation, but they do not replace the need to protect the original material.`,`डिजिटल मॉडल और चित्र दस्तावेजीकरण में सहायक हैं, पर वे मूल सामग्री की सुरक्षा की आवश्यकता को समाप्त नहीं करते।`],
 [`The value of ${nameEn} lies not only in a famous image but also in the evidence preserved across structures, objects and records.`,`${nameHi} का महत्व केवल प्रसिद्ध दृश्य में नहीं बल्कि संरचनाओं, वस्तुओं और अभिलेखों में सुरक्षित साक्ष्य में भी है।`],
 [`A careful study of ${nameEn} connects history with conservation, public access and the responsibility to preserve evidence for future readers.`,`${nameHi} का सावधान अध्ययन इतिहास को संरक्षण, सार्वजनिक पहुँच और भविष्य के लिए साक्ष्य बचाने की जिम्मेदारी से जोड़ता है।`]
]}
function makeFactsForStory(settingEn,settingHi,charEn,charHi,challengeEn,challengeHi,angleEn,angleHi){return [
 [`This is a fictional practice story set in ${settingEn}, where ${charEn} notices ${challengeEn}.`,`यह अभ्यास के लिए काल्पनिक कहानी है जो ${settingHi} में घटती है, जहाँ ${charHi} ${challengeHi} को देखता है।`],
 [`At first the problem looks small, but it begins to affect ordinary work, travel, study or access to water.`,`पहले समस्या छोटी लगती है, पर धीरे-धीरे वह काम, यात्रा, पढ़ाई या पानी की उपलब्धता को प्रभावित करने लगती है।`],
 [`Instead of guessing, the people nearby check what has actually happened and note the details that can be verified.`,`अनुमान लगाने के बजाय आसपास के लोग वास्तविक स्थिति देखते हैं और सत्यापित होने वाले विवरण दर्ज करते हैं।`],
 [`The story follows ${angleEn}, so each step shows why a simple decision can matter in daily life.`,`कहानी ${angleHi} पर केंद्रित है, इसलिए हर चरण दिखाता है कि दैनिक जीवन में छोटा निर्णय भी क्यों महत्वपूर्ण हो सकता है।`],
 [`One person suggests an immediate shortcut, while another asks whether the same problem will return the next day.`,`एक व्यक्ति तुरंत आसान उपाय सुझाता है, जबकि दूसरा पूछता है कि क्या वही समस्या अगले दिन फिर लौटेगी।`],
 [`The group chooses a solution that can be checked, explained and repeated if the situation occurs again.`,`समूह ऐसा समाधान चुनता है जिसे जाँचा, समझाया और स्थिति दोबारा आने पर फिर अपनाया जा सके।`],
 [`The fictional incident also shows how a child, worker, farmer or animal can be affected by conditions that adults sometimes overlook.`,`काल्पनिक घटना यह भी दिखाती है कि जिन परिस्थितियों को बड़े लोग नजरअंदाज कर देते हैं उनका असर बच्चे, कर्मचारी, किसान या पशु-पक्षी पर पड़ सकता है।`],
 [`A short written note prevents different people from remembering the same event in completely different ways.`,`छोटी लिखित टिप्पणी एक ही घटना को अलग-अलग लोगों द्वारा बिल्कुल अलग तरह से याद करने की समस्या कम करती है।`],
 [`By evening, the immediate difficulty is reduced, but the characters still discuss what should be repaired or prepared for the future.`,`शाम तक तत्काल कठिनाई कम हो जाती है, पर पात्र भविष्य के लिए आवश्यक मरम्मत या तैयारी पर भी चर्चा करते हैं।`],
 [`The story does not depend on a miracle; it moves through observation, cooperation and a few practical choices.`,`कहानी किसी चमत्कार पर निर्भर नहीं है; वह निरीक्षण, सहयोग और कुछ व्यावहारिक निर्णयों से आगे बढ़ती है।`],
 [`The experience leaves the community with a clearer routine for handling a similar problem later.`,`इस अनुभव से समुदाय के पास भविष्य में ऐसी समस्या सँभालने की अधिक स्पष्ट प्रक्रिया बन जाती है।`],
 [`The final lesson is simple: patience, accurate information and timely action often solve more than panic or rumour.`,`अंतिम सीख सरल है: धैर्य, सही जानकारी और समय पर कार्रवाई अक्सर घबराहट या अफवाह से अधिक उपयोगी होती है।`]
]}
function makeFactsForCurrent(titleEn,titleHi,angleEn,angleHi){return [
 [`This passage is about the process of reading current information, not about inventing a news event that has not been verified.`,`यह अनुच्छेद वर्तमान सूचना पढ़ने की प्रक्रिया पर है, किसी अपुष्ट समाचार घटना को गढ़ने पर नहीं।`],
 [`A headline is only a starting point; the date, source, location and original statement should be checked before a claim is repeated.`,`समाचार शीर्षक केवल शुरुआत है; किसी दावे को दोहराने से पहले तिथि, स्रोत, स्थान और मूल वक्तव्य जाँचना चाहिए।`],
 [`The subject of ${angleEn} becomes important when a fast message reaches people before the full context is available.`,`${angleHi} तब महत्वपूर्ण हो जाता है जब पूरी पृष्ठभूमि आने से पहले तेज संदेश लोगों तक पहुँच जाए।`],
 [`Official notices, primary documents and direct data are often more useful than a screenshot without a source.`,`बिना स्रोत वाले स्क्रीनशॉट की तुलना में आधिकारिक सूचना, मूल दस्तावेज और प्रत्यक्ष आँकड़े अधिक उपयोगी होते हैं।`],
 [`A number can be technically correct and still be misleading if the time period, base value or population is omitted.`,`समय अवधि, आधार मान या संबंधित समूह न बताया जाए तो सही संख्या भी भ्रामक हो सकती है।`],
 [`Photographs and videos also need context because old material can be shared again as if it were new.`,`चित्र और वीडियो को भी संदर्भ चाहिए क्योंकि पुरानी सामग्री को नया बताकर फिर साझा किया जा सकता है।`],
 [`A correction should be visible enough that readers who saw the first error can understand what changed.`,`सुधार इतना स्पष्ट होना चाहिए कि पहले गलत सूचना देखने वाला पाठक समझ सके कि क्या बदला है।`],
 [`Responsible reporting distinguishes what is confirmed, what is alleged and what remains unknown.`,`जिम्मेदार रिपोर्टिंग में पुष्टि हुई बात, आरोप और अभी अज्ञात तथ्य को अलग-अलग रखा जाता है।`],
 [`Readers should be cautious when an urgent message demands immediate sharing but gives no verifiable source.`,`ऐसे तात्कालिक संदेश से सावधान रहना चाहिए जो तुरंत साझा करने को कहे पर सत्यापित स्रोत न दे।`],
 [`A useful current-affairs note explains why the information matters without turning uncertainty into certainty.`,`उपयोगी समसामयिक टिप्पणी सूचना का महत्व बताती है पर अनिश्चितता को निश्चित तथ्य में नहीं बदलती।`],
 [`Comparing two reliable sources can reveal whether a difference is factual, numerical or simply a matter of emphasis.`,`दो भरोसेमंद स्रोतों की तुलना से पता चल सकता है कि अंतर तथ्य, संख्या या केवल जोर देने के तरीके का है।`],
 [`The safest habit is to verify first, note the date and source, and only then treat a claim as suitable for wider use.`,`सबसे सुरक्षित आदत है पहले सत्यापन करना, तिथि और स्रोत दर्ज करना और उसके बाद ही दावे को आगे उपयोग योग्य मानना।`]
]}
function makeFactsForScience(subjectEn,subjectHi,angleEn,angleHi){return makeFactsForSystem(subjectEn,subjectHi,angleEn,angleHi).map((p,i)=>i===0?[`A practical study of ${subjectEn} starts with observation, measurement and a record that can be checked later.`,`${subjectHi} का व्यावहारिक अध्ययन निरीक्षण, माप और बाद में जाँचे जा सकने वाले अभिलेख से शुरू होता है।`]:p)}
function makeFactsForHistory(subjectEn,subjectHi,angleEn,angleHi){return makeFactsForSystem(subjectEn,subjectHi,angleEn,angleHi).map((p,i)=>i===0?[`A careful historical account of ${subjectEn} compares evidence from more than one kind of source.`,`${subjectHi} का सावधान ऐतिहासिक विवरण एक से अधिक प्रकार के स्रोतों की तुलना करता है।`]:p)}

function dynamicTopicCard({date,targetType,exam={},language,difficulty,serial=1,attempt=0}){
 const random=rng([date,targetType,exam.id||0,exam.name||'',language,difficulty,serial,attempt,'dynamic-universe-v5'].join('|'));
 // Exam is weighted toward factual/public-service material; Practice gets more narrative variety.
 const familyPool=targetType==='practice'
  ? ['story','story','biography','heritage','science','system','history','current']
  : ['system','system','biography','heritage','science','history','current','story'];
 const family=pick(familyPool,random),angle=pick(ANGLES,random),lens=pick(LENSES,random),stage=pick(STAGES,random);let key,en,hi,facts,baseSubject;
 if(family==='biography'){
  const x=pick(BIO_PEOPLE,random);baseSubject=`bio:${x[0]}`;key=`${baseSubject}:${angle[0]}:${lens[0]}:${stage[0]}`;en=`${x[1]}: ${angle[1]}`;hi=`${x[2]}: ${angle[2]}`;facts=makeFactsForBio(x[1],x[2],x[3],x[4],angle[1],angle[2]);
 }else if(family==='heritage'){
  const x=pick(HERITAGE_PLACES,random);baseSubject=`place:${x[0]}`;key=`${baseSubject}:${angle[0]}:${lens[0]}:${stage[0]}`;en=`${x[1]}: ${angle[1]}`;hi=`${x[2]}: ${angle[2]}`;facts=makeFactsForPlace(x[1],x[2],x[3],x[4],angle[1],angle[2]);
 }else if(family==='story'){
  const st=pick(STORY_SETTINGS,random),ch=pick(STORY_CHARACTERS,random),pr=pick(STORY_CHALLENGES,random);baseSubject=`story:${st[0]}:${pr[0]}`;key=`${baseSubject}:${ch[0]}:${angle[0]}:${lens[0]}:${stage[0]}`;en=`A Short Fictional Story: ${st[1]}, ${pr[1]}`;hi=`एक छोटी काल्पनिक कहानी: ${st[2]}, ${pr[2]}`;facts=makeFactsForStory(st[1],st[2],ch[1],ch[2],pr[1],pr[2],angle[1],angle[2]);
 }else if(family==='current'){
  const x=pick(CURRENT_LITERACY,random);baseSubject=`current:${x[0]}`;key=`${baseSubject}:${angle[0]}:${lens[0]}:${stage[0]}`;en=x[1];hi=x[2];facts=makeFactsForCurrent(en,hi,angle[1],angle[2]);
 }else if(family==='science'){
  const x=pick(SCIENCE_SUBJECTS,random);baseSubject=`science:${x[0]}`;key=`${baseSubject}:${angle[0]}:${lens[0]}:${stage[0]}`;en=`${x[1]}: ${angle[1]}`;hi=`${x[2]}: ${angle[2]}`;facts=makeFactsForScience(x[1],x[2],angle[1],angle[2]);
 }else if(family==='history'){
  const x=pick(HISTORY_SUBJECTS,random);baseSubject=`history:${x[0]}`;key=`${baseSubject}:${angle[0]}:${lens[0]}:${stage[0]}`;en=`${x[1]}: ${angle[1]}`;hi=`${x[2]}: ${angle[2]}`;facts=makeFactsForHistory(x[1],x[2],angle[1],angle[2]);
 }else{
  const x=pick(SYSTEM_SUBJECTS,random);baseSubject=`system:${x[0]}`;key=`${baseSubject}:${angle[0]}:${lens[0]}:${stage[0]}`;en=`${x[1]}: ${angle[1]}`;hi=`${x[2]}: ${angle[2]}`;facts=makeFactsForSystem(x[1],x[2],angle[1],angle[2]);
 }
 if(targetType!=='practice')facts=[[`This version looks at the subject through ${lens[1]} ${stage[1]}, giving the passage a different practical focus.`,`इस रूप में विषय को ${lens[2]} के दृष्टिकोण से ${stage[2]} देखा गया है, जिससे अनुच्छेद का व्यावहारिक केंद्र अलग रहता है।`],...facts.slice(0,11)];
 en=`${en} with a focus on ${lens[1]}`;hi=`${hi}, विशेष ध्यान ${lens[2]}`;
 return {key,en,hi,facts,family,baseSubject,signature:crypto.createHash('sha256').update(key).digest('hex')};
}

const EXAM_TOPIC_KEYS=new Set(['high-court','sarnath','nalanda','kalam','patel','railway','archives','disaster']);
const PRACTICE_TOPIC_KEYS=new Set(['village-water','rural-roads','fatehpur','savitribai','lakshmibai','public-library','irrigation','postal-service','digital-service']);
function preferredTopicPool(targetType,exam={}){
 const all=TOPICS;
 // Hard separation: daily Exam/Live and Daily Practice never draw from the same concrete topic bank.
 // Both banks still contain a mix of history, biography, public service and real-life issues.
 if(targetType==='practice')return all.filter(x=>PRACTICE_TOPIC_KEYS.has(x.key));
 const examBank=all.filter(x=>EXAM_TOPIC_KEYS.has(x.key));
 const name=(String(exam.name||'')+' '+String(exam.slug||'')).toLowerCase();
 let preferred=[];
 if(/court|judicial|judge|clerk|steno/.test(name))preferred=['high-court','archives','sarnath','nalanda'];
 else if(/railway|rrb|ntpc/.test(name))preferred=['railway','archives','disaster','patel'];
 else if(/police|operator|assistant|upsssc|ssc|secretariat|office|data entry/.test(name))preferred=['high-court','archives','railway','disaster','kalam','patel','sarnath','nalanda'];
 else preferred=[...EXAM_TOPIC_KEYS];
 const set=new Set(preferred),pool=examBank.filter(x=>set.has(x.key));
 return pool.length?pool:examBank;
}
function scopeLine(line,targetType,language,index){
 if(targetType!=='practice')return line;
 const base=String(line||'').replace(/[.!?।]+$/,'');
 const en=[', and the same point can be seen in ordinary community work.',', which becomes clearer when people deal with the issue in daily life.',', a detail that is easy to recognise in a local setting.',', and this is often noticed before any formal report is prepared.',', which helps connect the subject with a familiar real-life situation.'];
 const hi=[', और यही बात सामान्य सामुदायिक काम में भी दिखाई देती है।',', जो रोजमर्रा के जीवन में इस विषय को और स्पष्ट बनाती है।',', और स्थानीय परिस्थिति में इस विवरण को आसानी से समझा जा सकता है।',', जिसे औपचारिक रिपोर्ट बनने से पहले भी लोग अक्सर अनुभव कर लेते हैं।',', जिससे विषय को परिचित वास्तविक परिस्थिति से जोड़ना आसान होता है।'];
 return base+(language==='Hindi'?hi:en)[index%5];
}

function officialNumeric(language,difficulty,random){
 if(!['Moderate to Hard','Hard'].includes(difficulty))return '';
 const y=number(random,2018,2026),m=number(random,1,12),d=number(random,1,28),a=number(random,10,98),b=number(random,100,999),c=number(random,1000,9999),room=number(random,1,9),pct=number(random,61,98),amt=number(random,12,96)*1000+number(random,120,980);
 const slash=`${number(random,10,99)}/${number(random,100,999)}`, ref=`${String.fromCharCode(65+number(random,0,20))}-${b}/${String(y).slice(-2)}`;
 if(language==='Hindi'){
  if(difficulty==='Hard')return `जाँच पत्र में संदर्भ (${ref}), दिनांक ${String(d).padStart(2,'0')}-${String(m).padStart(2,'0')}-${y}, कक्ष ${room}, प्रगति ${pct}% और राशि ₹${amt.toLocaleString('en-IN')}.50 दर्ज थी। दूसरी सूची में फाइल ${slash} तथा क्रम ${c} लिखा था; मिलान के बाद ही प्रविष्टि स्वीकार की गई।`;
  return `अभिलेख में संदर्भ (${ref}), कक्ष ${room} और क्रम ${c}-${a} दर्ज था। जाँच के समय ${number(random,12,39)} प्रविष्टियाँ सही मिलीं, जबकि ${number(random,2,9)} प्रविष्टियों को दोबारा देखने के लिए अलग रखा गया।`;
 }
 if(difficulty==='Hard')return `The verification sheet carried reference (${ref}), date ${String(d).padStart(2,'0')}-${String(m).padStart(2,'0')}-${y}, room ${room}, progress ${pct}% and an amount of Rs. ${amt.toLocaleString('en-IN')}.50. A second list showed file ${slash} and serial ${c}; the entry was accepted only after both records matched.`;
 return `The record showed reference (${ref}), room ${room} and serial ${c}-${a}. During checking, ${number(random,12,39)} entries matched, while ${number(random,2,9)} were kept aside for a second review.`;
}


// Exam-only notation. Numbers are always used in real-looking contexts such as dates, prices,
// times, percentages, reference numbers or counts; never as a bare 0123456789 sequence.
function examOfficialNumeric(language,difficulty,random){
 if(!['Medium','Moderate to Hard','Hard'].includes(difficulty))return '';
 const y=number(random,2019,2026),m=number(random,1,12),d=number(random,1,28),hh=number(random,9,18),mm=String(number(random,0,59)).padStart(2,'0');
 const qty=number(random,12,96),pct=number(random,62,98),serial=number(random,1000,9999),price=number(random,1250,98500);
 const ref=`${String.fromCharCode(65+number(random,0,20))}-${number(random,100,999)}/${String(y).slice(-2)}`;
 const date=`${String(d).padStart(2,'0')}-${String(m).padStart(2,'0')}-${y}`;
 if(language==='Hindi'){
  if(difficulty==='Medium')return `संक्षिप्त जाँच में दिनांक ${date}, रसीद (${ref}) और ₹${price.toLocaleString('en-IN')} की राशि मिलाई गई; टिप्पणी "प्राप्त" दर्ज थी।`;
  if(difficulty==='Moderate to Hard')return `अभिलेख (${ref}) में दिनांक ${date}, समय ${hh}:${mm}, ${qty} प्रविष्टियाँ और ₹${price.toLocaleString('en-IN')}.50 की राशि दर्ज थी; ${pct}% कार्य पूरा होने पर फाइल को "Review-${number(random,1,4)}" के लिए अलग रखा गया।`;
  return `सत्यापन पत्र (${ref}) में दिनांक ${date}, समय ${hh}:${mm}, क्रम ${serial}-${number(random,10,99)}, प्रगति ${pct}% और ₹${price.toLocaleString('en-IN')}.50 दर्ज था; टिप्पणी "Priority-${String.fromCharCode(65+number(random,0,3))}" तथा अनुभाग (${number(random,1,9)}-B) का अलग मिलान किया गया।`;
 }
 if(difficulty==='Medium')return `A short check matched the date ${date}, receipt (${ref}), and price Rs. ${price.toLocaleString('en-IN')}; the remark "Received" was recorded.`;
 if(difficulty==='Moderate to Hard')return `Record (${ref}) listed the date ${date}, time ${hh}:${mm}, ${qty} entries, and a price of Rs. ${price.toLocaleString('en-IN')}.50; after ${pct}% completion, the file was marked "Review-${number(random,1,4)}".`;
 return `The verification sheet (${ref}) carried date ${date}, time ${hh}:${mm}, serial ${serial}-${number(random,10,99)}, progress ${pct}%, and Rs. ${price.toLocaleString('en-IN')}.50; the remark "Priority-${String.fromCharCode(65+number(random,0,3))}" and section (${number(random,1,9)}-B) were checked separately.`;
}

function examHardNotation(language,random,index){
 const y=number(random,2021,2026),date=`${String(number(random,1,28)).padStart(2,'0')}/${String(number(random,1,12)).padStart(2,'0')}/${y}`;
 const amount=number(random,2500,125000),count=number(random,18,88),ref=`${String.fromCharCode(65+number(random,0,20))}-${number(random,100,999)}/${String(y).slice(-2)}`;
 if(language==='Hindi'){
  const rows=[
   `फाइल (${ref}) पर "Urgent-${number(random,1,5)}" लिखा था; दिनांक ${date} को ₹${amount.toLocaleString('en-IN')} की प्रविष्टि और ${count} संलग्नक दोबारा जाँचे गए।`,
   `रजिस्टर में "नाम/तिथि/राशि" तीनों का मिलान आवश्यक था; कक्ष (${number(random,1,12)}-A), क्रम ${number(random,1000,9999)}-${number(random,10,99)} और समय ${number(random,9,18)}:${String(number(random,0,59)).padStart(2,'0')} भी दर्ज था।`,
   `आदेश संख्या ${ref} के साथ (${number(random,2,8)} प्रतियाँ), ${number(random,65,99)}% प्रगति और ₹${amount.toLocaleString('en-IN')}.75 का विवरण था; टिप्पणी "Re-check" मिलने पर अंतिम प्रविष्टि रोकी गई।`
  ];return rows[index%rows.length];
 }
 const rows=[
  `File (${ref}) was marked "Urgent-${number(random,1,5)}"; on ${date}, a price entry of Rs. ${amount.toLocaleString('en-IN')} and ${count} attachments were checked again.`,
  `The register required "Name/Date/Amount" to match; room (${number(random,1,12)}-A), serial ${number(random,1000,9999)}-${number(random,10,99)}, and time ${number(random,9,18)}:${String(number(random,0,59)).padStart(2,'0')} were also recorded.`,
  `Order no. ${ref} listed (${number(random,2,8)} copies), ${number(random,65,99)}% progress, and Rs. ${amount.toLocaleString('en-IN')}.75; the final entry was held when the remark "Re-check" appeared.`
 ];return rows[index%rows.length];
}

function fitExamHardCharacters(text,language,random){
 let out=String(text||'').replace(/\s+/g,' ').trim();
 // Hard Exam matter is intentionally kept around 3,400-4,200 characters without changing any exam setting.
 let guard=0;
 while(out.length<3500&&guard++<12){
  out+=' '+examHardNotation(language,random,guard)+' '+examOfficialNumeric(language,'Hard',random);
 }
 if(out.length>4180){
  const floor=3450,limit=4180;
  let cut=-1;
  const marks=language==='Hindi'?['। ','. ']:['. ','। '];
  for(const mark of marks){const i=out.lastIndexOf(mark,limit);if(i>=floor)cut=Math.max(cut,i+mark.trim().length)}
  if(cut<floor){
   const space=out.lastIndexOf(' ',limit);cut=space>=floor?space:limit;
  }
  out=out.slice(0,cut).trim();
 }
 return out;
}

function contextualize(sentence,focus,language,index){
 const en=[
  `, a useful point when ${focus} is examined closely.`,`, especially in a practical account of ${focus}.`,`, which helps keep an explanation of ${focus} grounded.`,`, a detail worth remembering while studying ${focus}.`,`, which becomes clearer in the wider context of ${focus}.`,`, an approach that supports a balanced account of ${focus}.`,`, which is relevant when records about ${focus} are checked later.`,`, a useful habit for anyone trying to understand ${focus}.`,`, which keeps the main issue visible in a discussion of ${focus}.`,`, a practical standard when the subject of ${focus} is reviewed.`,`, which reduces confusion in a detailed account of ${focus}.`,`, an important consideration in any careful study of ${focus}.`
 ];
 const hi=[
  `, जो ${focus} को ध्यान से समझने में उपयोगी बात है।`,`, विशेषकर ${focus} के व्यावहारिक विवरण में।`,`, जिससे ${focus} का विवरण तथ्यपरक बना रहता है।`,`, और ${focus} का अध्ययन करते समय यह बात याद रखना उपयोगी है।`,`, जो ${focus} के व्यापक संदर्भ में अधिक स्पष्ट हो जाती है।`,`, और यह ${focus} का संतुलित विवरण तैयार करने में सहायक है।`,`, जो बाद में ${focus} से जुड़े अभिलेख जाँचते समय उपयोगी रहती है।`,`, और ${focus} को समझने वाले पाठक के लिए यह व्यावहारिक आदत है।`,`, जिससे ${focus} की चर्चा में मुख्य विषय स्पष्ट बना रहता है।`,`, और ${focus} की समीक्षा में यह उपयोगी मानक बन सकता है।`,`, जिससे ${focus} के विस्तृत विवरण में भ्रम कम होता है।`,`, और ${focus} के सावधान अध्ययन में यह महत्वपूर्ण बात है।`
 ];
 const base=String(sentence||'').replace(/[.!?।]+$/,'');return base+(language==='Hindi'?hi:en)[index%12];
}

function paragraphForFact(fact,language,difficulty,random,index,shift,focus,targetType){
 const hi=language==='Hindi',base=hi?fact[1]:fact[0];
 const notesEn=[
  'A clerk, teacher, visitor or field worker may see only one part of the process, which is why the complete record is important.',
  'The point is easy to miss when work is rushed, but it becomes obvious when the same task must be checked several weeks later.',
  'In a real office or public facility, this kind of detail affects time, cost and the confidence of the people using the service.',
  'The most useful approach is to keep the language plain, verify uncertain details and separate observation from assumption.',
  'Where several people are involved, coordination works better when instructions are specific and the next action is written down.',
  'This also shows why a reliable routine can be more valuable than a complicated system that staff do not consistently follow.',
  'A well prepared note gives the next reader enough background to understand why a particular action was considered necessary.',
  'The detail becomes more useful when it is connected with the people affected by the decision rather than left as an isolated statement.',
  'Careful work means checking names and sequence before a record is treated as final, especially when later action depends on it.',
  'A practical account should show what changed, what remained the same and what still needs attention after the immediate task.',
  'The strongest explanation avoids unnecessary decoration and keeps the main fact visible from the beginning to the end.',
  'When the subject is reviewed later, a clear trail of information makes it easier to distinguish a genuine change from a simple misunderstanding.'
 ];
 const notesHi=[
  'कर्मचारी, शिक्षक, आगंतुक या क्षेत्रीय कार्यकर्ता प्रक्रिया का केवल एक हिस्सा देख सकता है, इसलिए पूरा अभिलेख महत्वपूर्ण हो जाता है।',
  'काम जल्दी में हो तो यह बात छोटी लग सकती है, लेकिन कई सप्ताह बाद उसी कार्य की जाँच करनी पड़े तो उसका महत्व स्पष्ट हो जाता है।',
  'वास्तविक कार्यालय या सार्वजनिक सुविधा में ऐसा विवरण समय, लागत और सेवा लेने वाले लोगों के विश्वास पर असर डालता है।',
  'सबसे उपयोगी तरीका सरल भाषा रखना, संदिग्ध विवरण की पुष्टि करना और अनुमान को तथ्य से अलग रखना है।',
  'कई लोग जुड़े हों तो समन्वय तब बेहतर होता है जब निर्देश स्पष्ट हों और अगला कदम लिखित रूप में दर्ज हो।',
  'यह भी बताता है कि नियमित और भरोसेमंद प्रक्रिया उस जटिल व्यवस्था से बेहतर हो सकती है जिसका पालन लगातार न किया जाए।',
  'अच्छी तरह तैयार टिप्पणी अगले पाठक को इतना संदर्भ देती है कि वह समझ सके कि किसी कार्रवाई को आवश्यक क्यों माना गया।',
  'विवरण तब अधिक उपयोगी बनता है जब उसे निर्णय से प्रभावित लोगों के अनुभव से जोड़ा जाए और अलग सूचना की तरह न छोड़ा जाए।',
  'सावधानी का अर्थ है कि अभिलेख अंतिम मानने से पहले नाम और क्रम जाँचे जाएँ, विशेषकर जब आगे की कार्रवाई उसी पर निर्भर हो।',
  'व्यावहारिक विवरण में यह दिखना चाहिए कि क्या बदला, क्या समान रहा और तत्काल कार्य के बाद किस बात पर अभी ध्यान देना है।',
  'सबसे मजबूत व्याख्या अनावश्यक सजावट से बचती है और मुख्य तथ्य को शुरुआत से अंत तक स्पष्ट रखती है।',
  'बाद की समीक्षा में स्पष्ट सूचना क्रम से वास्तविक परिवर्तन और साधारण गलतफहमी के बीच अंतर करना आसान हो जाता है।'
 ];
 const simple=hi?EASY_HI:EASY_EN,notes=hi?notesHi:notesEn;
 if(difficulty==='Easy'){
  const extra=[];for(let k=0;k<5;k++)extra.push(scopeLine(simple[(index*5+shift+k*3)%simple.length],targetType,language,index+k));
  return `${base} ${extra.join(' ')}`;
 }
 const note=scopeLine(contextualize(notes[(index+shift)%12],focus,language,index+shift),targetType,language,index+shift);
 if(difficulty==='Medium'){
  const s1=scopeLine(simple[(index*3+shift)%simple.length],targetType,language,index),s2=scopeLine(simple[(index*3+shift+7)%simple.length],targetType,language,index+2);
  let out=`${base} ${note} ${s1} ${s2}`;
  if(targetType==='exam'&&(index+1)%4===0){const n=examOfficialNumeric(language,difficulty,random);if(n)out+=' '+n}
  return out;
 }
 const bridge=scopeLine(contextualize((hi?BRIDGE_HI:BRIDGE_EN)[(index*5+shift)%12],focus,language,index*3+shift),targetType,language,index+1);
 if(difficulty==='Moderate to Hard'){
  let out=`${base} ${note} ${bridge}`;
  if(targetType==='exam'){
   if((index+1)%2===0){const n=examOfficialNumeric(language,difficulty,random);if(n)out+=' '+n}
  }else{
   if((index+1)%3===0){const n=officialNumeric(language,difficulty,random);if(n)out+=' '+n}
  }
  return out;
 }
 const support=scopeLine(contextualize((hi?SUPPORT_HI:SUPPORT_EN)[(index*7+shift)%12],focus,language,index*7+shift),targetType,language,index+3);
 const hard=scopeLine((hi?HARD_HI:HARD_EN)[(index+shift)%6],targetType,language,index+4);
 let out=`${base} ${note} ${bridge} ${support} ${hard}`;
 if(targetType==='exam'){
  out+=' '+examHardNotation(language,random,index);
  const n=examOfficialNumeric(language,difficulty,random);if(n)out+=' '+n
 }else{
  if((index+1)%2===0){const n=officialNumeric(language,difficulty,random);if(n)out+=' '+n}
 }
 return out;
}

const TAIL_EN=[
 'The final check kept the record clear and left the next working step easy to understand.',
 'Before closing, staff reviewed the pending note once more and marked the next action in plain language.',
 'The completed record was kept in order so that another person could continue the work without guessing.',
 'A brief review at the end of the task helped prevent a small mistake from becoming a larger problem.'
];
const TAIL_HI=[
 'अंतिम जाँच से अभिलेख स्पष्ट रहा और अगले कार्य चरण को समझना आसान हो गया।',
 'काम बंद करने से पहले कर्मचारियों ने लंबित टिप्पणी फिर देखी और अगला कदम सरल भाषा में दर्ज किया।',
 'पूरा अभिलेख सही क्रम में रखा गया ताकि दूसरा व्यक्ति बिना अनुमान लगाए काम आगे बढ़ा सके।',
 'कार्य के अंत में छोटी समीक्षा ने साधारण गलती को बड़ी समस्या बनने से रोकने में मदद की।'
];
const SMALL_EN={
 1:'Complete.',2:'Work ended.',3:'Work ended safely.',4:'The work ended safely.',5:'The final work ended safely.',6:'The final review ended without delay.',7:'The final review was completed without delay.',8:'The team completed the final review without delay.',9:'The team completed the final review carefully without delay.',10:'The team completed the final review carefully and without delay.',11:'The team completed the final review carefully and closed the record.',12:'The team completed the final review carefully and then closed the record.',13:'The team completed the final review carefully and then closed the official record.',14:'The team completed the final review carefully and then closed the official record safely.',15:'The team completed the final review carefully and then closed the official record for today.',16:'The team completed the final review carefully and then closed the official record for the day.',17:'The team completed the final review carefully and then closed the official record for the working day.',18:'The team completed the final review carefully and then closed the official record for today without any delay.',19:'The team completed the final review carefully and then closed the official record for today and without any delay.',20:'The team completed the final review carefully and then closed the official record for the day without any further delay.'
};
const SMALL_HI={
 1:'समाप्त।',2:'काम समाप्त।',3:'आज काम समाप्त।',4:'आज का काम समाप्त।',5:'आज का काम पूरा हुआ।',6:'आज का अंतिम काम पूरा हुआ।',7:'आज अंतिम जाँच समय पर पूरी हुई।',8:'आज की अंतिम जाँच समय पर पूरी हुई।',9:'दल ने आज अंतिम जाँच सावधानी से पूरी की।',10:'दल ने आज अंतिम जाँच बहुत सावधानी से पूरी की।',11:'दल ने आज अंतिम जाँच बहुत सावधानी से पूरी कर दी।',12:'दल ने आज अंतिम जाँच बहुत सावधानी से समय पर पूरी की।',13:'दल ने आज अंतिम जाँच बहुत सावधानी से समय पर ही पूरी की।',14:'दल ने आज अंतिम जाँच बहुत सावधानी से और शांत ढंग से पूरी की।',15:'दल ने आज अंतिम जाँच बहुत सावधानी से और शांत ढंग से पूरी की थी।',16:'दल ने आज अंतिम जाँच बहुत सावधानी से और शांत ढंग से समय पर पूरी की।',17:'दल ने आज अंतिम जाँच बहुत सावधानी से और शांत ढंग से समय पर ही पूरी की।',18:'दल ने आज अंतिम जाँच सावधानी से और शांत ढंग से समय पर पूरी करके अभिलेख बंद किया।',19:'दल ने आज अंतिम जाँच बहुत सावधानी से और शांत ढंग से समय पर पूरी करके अभिलेख बंद किया।',20:'दल ने आज अंतिम जाँच बहुत सावधानी से और शांत ढंग से समय पर पूरी करके सुरक्षित अभिलेख बंद किया।'
};
function smallClosing(language,n){return (language==='Hindi'?SMALL_HI:SMALL_EN)[n]||''}
function fitExactly(parts,target,language,targetType='exam'){
 const out=[];let used=0;
 for(const part of parts){const c=wordCount(part);if(!c)continue;if(used+c<=target-20){out.push(part);used+=c}else break}
 const rawTails=language==='Hindi'?TAIL_HI:TAIL_EN;
 const tails=targetType==='practice'?rawTails.map((x,i)=>scopeLine(x,targetType,language,i+20)):rawTails;
 let guard=0;
 while(target-used>20&&guard++<20){
  const remaining=target-used;
  const candidates=tails.filter(line=>{const c=wordCount(line);return c<remaining&&remaining-c>=1});
  if(!candidates.length)break;
  const chosen=candidates[guard%candidates.length];
  out.push(chosen);used+=wordCount(chosen);
 }
 let remaining=target-used;
 if(remaining>0){
  if(remaining<=20){out.push(smallClosing(language,remaining));used+=remaining}
  else {
   // Extremely defensive fallback; normally unreachable because tail sentences reduce the remainder below 21.
   const raw=(language==='Hindi'?TAIL_HI.join(' '):TAIL_EN.join(' ')).split(/\s+/).slice(0,remaining).join(' ');
   out.push(raw.replace(/[.,;:!?।]+$/,'')+(language==='Hindi'?'।':'.'));used+=wordCount(raw)
  }
 }
 let text=out.join(' ').replace(/\s+/g,' ').trim();
 const words=text.match(/\S+/g)||[];
 if(words.length!==target)throw Error(`Daily passage word target mismatch: ${words.length}/${target}`);
 return text;
}
function legacyCompose({difficulty,date,targetType,exam,serial,attempt},target){
 const random=rng([date,targetType,exam.id||0,exam.name||'',difficulty,serial,attempt,'legacy-v4'].join('|'));
 const subjects=['vkosnu','i=','vfHkys[k','fooj.k','izLrko','lwpuk','lq>ko','izfrosnu','dk;ZØe','izk:i',"izf'k{k.k",'iath','dk;kZy;','vH;FkhZ'];
 const actions=['dh tk¡p /;ku ls dh xbZ','ds fooj.k dks i<+dj lgh LFkku ij j[kk x;k','ls lacaf/kr tkudkjh lHkh dks nh xbZ','dk fooj.k iath esa ntZ fd;k x;k',"ds fy, vko';d dkxt rS;kj fd, x,",'ls lacaf/kr dk;Z le; ij iwjk fd;k x;k','dh izfr lqjf{kr LFkku ij j[kh xbZ','dk lkj la{ksi esa fy[kk x;k',"ls lacaf/kr i= lgh 'kk[kk esa Hkstk x;k",'dh tk¡p ds ckn vxys dk;Z ij /;ku fn;k x;k'];
 const arr=[];for(let round=0;round<20;round++)for(const s of shuffle(subjects,random))arr.push(`${s} ${pick(actions,random)}A`);
 return fitExactly(arr,target,'English',targetType);
}
function composeDynamicDetailed({language,difficulty,date,targetType,exam={},serial=1,attempt=0}){
 const target=sourceTargetWords(language,targetType,exam,difficulty),legacy=language==='Hindi'&&/kruti|devlys|chanakya/i.test(exam.layout||'');
 if(legacy){
  const content=legacyCompose({difficulty,date,targetType,exam,serial,attempt},target);
  return {content,topicTitle:`${language} Typing Matter`,topicSignature:null,topicFamily:'legacy',baseSubject:'legacy'};
 }
 const random=rng([date,targetType,exam.id||0,exam.name||'',language,difficulty,serial,attempt,'human-v5'].join('|'));
 const topic=dynamicTopicCard({language,difficulty,date,targetType,exam,serial,attempt}),hi=language==='Hindi',parts=[];
 parts.push(targetType==='practice'?`${hi?topic.hi:topic.en}.`:`${hi?topic.hi:topic.en}. ${scopeLine(pick(hi?OPEN_HI:OPEN_EN,random),targetType,language,0)}`);
 const facts=shuffle(topic.facts,random),shift=Math.floor(random()*12),focus=hi?topic.hi.split(/\s+/).slice(0,4).join(' '):topic.en.split(/\s+/).slice(0,5).join(' ');
 for(let i=0;i<facts.length;i++)parts.push(paragraphForFact(facts[i],language,difficulty,random,i,shift,focus,targetType));
 parts.push(scopeLine(pick(hi?CLOSE_HI:CLOSE_EN,random),targetType,language,99));
 if(targetType==='exam'&&difficulty==='Easy'){for(let i=0;i<parts.length;i++)parts[i]=parts[i].replace(/[()\/: %₹"-]+/g,' ').replace(/\d+/g,' ').replace(/\s+/g,' ').trim()}else if(targetType!=='exam'&&['Easy','Medium'].includes(difficulty)){for(let i=0;i<parts.length;i++)parts[i]=parts[i].replace(/[()\/: %₹-]+/g,' ').replace(/\s+/g,' ').trim()}
 let content=fitExactly(parts,target,language,targetType);if(targetType==='exam'&&difficulty==='Hard')content=fitExamHardCharacters(content,language,random);return {content,topicTitle:hi?topic.hi:topic.en,topicSignature:topic.signature,topicFamily:topic.family,baseSubject:topic.baseSubject};
}

// Practice-only long matter: use several distinct factual/narrative topic cards
// rather than padding every difficulty with the same stock explanatory sentences.
function composePracticeDetailed({language,difficulty,date,exam={},serial=1,attempt=0}){
 const target=sourceTargetWords(language,'practice',exam,difficulty),hi=language==='Hindi';
 const random=rng([date,language,difficulty,serial,attempt,'practice-topic-series-v2'].join('|'));
 const preferred={Easy:new Set(['story','heritage']),Medium:new Set(['biography','history']),'Moderate to Hard':new Set(['system','history']),Hard:new Set(['science','current'])}[difficulty]||new Set(['story','system','science']);
 const cards=[],seen=new Set();let available=0;
 const section=(Number(String(date).replace(/\D/g,''))+Number(serial)+(difficulty==='Hard'?1:0))%3;
 for(let i=0;i<800&&available<target+90;i++){
  const card=dynamicTopicCard({date,targetType:'practice',exam,language,difficulty,serial:serial+i*13,attempt:attempt+i});
  if(!preferred.has(card.family)||seen.has(card.baseSubject))continue;
  seen.add(card.baseSubject);const first=section*4;const facts=shuffle(card.facts.slice(first,first+4).concat(difficulty==='Medium'?[card.facts[(first+4)%card.facts.length]]:[]),random);cards.push({card,facts});
  available+=wordCount(hi?card.hi:card.en)+facts.reduce((n,p)=>n+wordCount(hi?p[1]:p[0]),0);
 }
 if(available<target+20)throw Error('Not enough distinct Practice topic matter');
 const parts=[];
 for(const {card,facts} of cards){
  const title=hi?card.hi.split(', विशेष ध्यान ')[0]:card.en.split(' with a focus on ')[0];
  parts.push(`${title}.`);
  for(const fact of facts)parts.push(hi?fact[1]:fact[0]);
  // Practice difficulty is applied to typed matter itself, not just the card label.
  // Easy/Medium have familiar words; upper levels include increasingly demanding figures and punctuation.
  if(difficulty==='Moderate to Hard'&&parts.length%3===0){
   const n=number(random,12,98);
   parts.push(hi?`नमूना रजिस्टर में प्रविष्टि ${n} और तिथि ${number(random,1,28)}.${number(random,1,12)}.2026 को सही क्रम में मिलाना जरूरी है।`:`In a sample register, entry ${n} and date ${number(random,1,28)}.${number(random,1,12)}.2026 must match the original sequence.`);
  }
  if(difficulty==='Hard'){
   const n=number(random,101,999),fraction=number(random,11,98),day=number(random,10,28);
   parts.push(hi?`उदाहरण के लिए, संदर्भ क्रमांक AB-${n}/26, दिनांक ${day}.09.2026 और ${fraction}.75% के आँकड़ों को बिना अनुमान लगाए बिल्कुल सही लिखें; उद्धरण “अभिलेख सत्यापित है” में चिह्न भी महत्वपूर्ण हैं।`:`For example, reference AB-${n}/26, date ${day}.09.2026 and the figure ${fraction}.75% must be copied exactly; in the note "Record verified, re-check required," every symbol matters.`);
  }
 }
 if(difficulty==='Easy'||difficulty==='Medium')for(let i=0;i<parts.length;i++)parts[i]=parts[i].replace(/[()\/: %₹"-]+/g,' ').replace(/\s+/g,' ').trim();
 const content=fitExactly(parts,target,language,'practice'),first=cards[0].card;
 return {content,topicTitle:hi?first.hi:first.en,topicSignature:first.signature,topicFamily:first.family,baseSubject:first.baseSubject};
}

// Exam + Practice use the broad dynamic topic universe. Live keeps its existing generator.
// Learning is not handled in this file and remains untouched.
function composeDetailed(args){
 const type=String(args?.targetType||'');
 if(type==='practice')return composePracticeDetailed(args);
 if(type==='exam')return composeDynamicDetailed(args);
 return {content:legacyDaily.compose(args),topicTitle:null,topicSignature:null,topicFamily:'live',baseSubject:'live'};
}
function compose(args){return composeDetailed(args).content}
module.exports={compose,composeDetailed,LEVELS,EXAM_COUNTS,PRACTICE_COUNTS,PRACTICE_30_MIN_WORDS,matterWordsForExam,createService};
function createService(db,{setting,indiaDateParts,onChange}){
 const changed=typeof onChange==='function'?onChange:()=>{};
 db.exec(`CREATE TABLE IF NOT EXISTS daily_auto_slots(slot TEXT PRIMARY KEY,queue_id INTEGER,passage_id INTEGER,content_hash TEXT NOT NULL UNIQUE,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
 db.exec(`CREATE TABLE IF NOT EXISTS daily_topic_history(id INTEGER PRIMARY KEY AUTOINCREMENT,signature TEXT NOT NULL UNIQUE,family TEXT,base_subject TEXT,title TEXT,target_type TEXT,exam_id INTEGER,language TEXT,difficulty TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
 const hash=s=>crypto.createHash('sha256').update(String(s).replace(/\s+/g,' ').trim()).digest('hex');
 const upsert=db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP");
 if(setting('daily_auto_v2_installed')!=='1')db.transaction(()=>{upsert.run('daily_queue_enabled','1');upsert.run('daily_queue_skip_date','');upsert.run('daily_auto_practice_enabled','1');upsert.run('daily_auto_exam_enabled','1');upsert.run('daily_auto_v2_installed','1')})();
 function controls(){return {enabled:setting('daily_queue_enabled')!=='0',exam_enabled:setting('daily_auto_exam_enabled')!=='0',practice_enabled:setting('daily_auto_practice_enabled')!=='0',today:indiaDateParts().date,skip_date:'',time:'10:00 Asia/Kolkata'}}
 function setControls(b){db.transaction(()=>{for(const [key,field] of [['daily_queue_enabled','enabled'],['daily_auto_exam_enabled','exam_enabled'],['daily_auto_practice_enabled','practice_enabled']])if(typeof b[field]==='boolean')upsert.run(key,b[field]?'1':'0');upsert.run('daily_queue_skip_date','')})();changed();return controls()}
 function run(date=indiaDateParts().date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Invalid date');
  const c=controls();if(!c.enabled)return {created:0,date,skipped:true};
  const targets=[];
  if(c.exam_enabled)for(const ex of db.prepare("SELECT * FROM exams WHERE active=1 AND slug NOT LIKE 'live-template-%'").all())if(['English','Hindi'].includes(ex.language))targets.push({type:'exam',exam:ex,language:ex.language,counts:EXAM_COUNTS});
  if(setting('live_daily_enabled')==='1')for(const language of ['English','Hindi'])targets.push({type:'live',exam:{id:0,name:'Live Typing',layout:language==='Hindi'?'Unicode / Mangal':'QWERTY'},language,counts:[2,2,0,2]});
  if(c.practice_enabled)for(const language of ['English','Hindi'])targets.push({type:'practice',exam:{id:0,name:'Typing Practice',layout:language==='Hindi'?'Unicode / Mangal':'QWERTY'},language,counts:PRACTICE_COUNTS});
  const findSlot=db.prepare('SELECT 1 FROM daily_auto_slots WHERE slot=?'),existsHash=db.prepare('SELECT 1 FROM daily_auto_slots WHERE content_hash=?');
  const existsTopic=db.prepare('SELECT 1 FROM daily_topic_history WHERE signature=?');
  const recentBase=db.prepare('SELECT 1 FROM (SELECT base_subject FROM daily_topic_history WHERE base_subject IS NOT NULL ORDER BY id DESC LIMIT 36) WHERE base_subject=? LIMIT 1');
  const insertTopic=db.prepare('INSERT INTO daily_topic_history(signature,family,base_subject,title,target_type,exam_id,language,difficulty) VALUES(?,?,?,?,?,?,?,?)');
  // Global content uniqueness: an exact passage already stored in Exam, Practice, Live or manual matter
  // is never inserted again into another mode. Exam rows carry exam_id; Practice rows always keep exam_id NULL.
  const knownHashes=new Set(db.prepare('SELECT content FROM passages WHERE content IS NOT NULL').all().map(r=>hash(r.content)));
  for(const r of db.prepare('SELECT content FROM daily_passage_queue WHERE content IS NOT NULL').all())knownHashes.add(hash(r.content));
  const queue=db.prepare("INSERT INTO daily_passage_queue(queue_date,queue_no,target_type,exam_id,exam_name,language,difficulty,title,content,status,manual) VALUES(?,?,?,?,?,?,?,?,?,?,0)");
  const passage=db.prepare('INSERT INTO passages(title,language,layout,difficulty,content,active,highlight_mode,exam_id,auto_scroll,result_count_mode) VALUES(?,?,?,?,?,1,?,?,?,?)');
  const slotInsert=db.prepare('INSERT INTO daily_auto_slots(slot,queue_id,passage_id,content_hash) VALUES(?,?,?,?)');
  let created=0,published=0;const tx=db.transaction(()=>{for(const t of targets){let qn=100;for(let l=0;l<LEVELS.length;l++)for(let n=1;n<=t.counts[l];n++){
   qn++;const difficulty=LEVELS[l],slot=[date,t.type,t.exam.id,t.language,difficulty,n].join('|');if(findSlot.get(slot))continue;
   let content,contentHash,meta=null;const attempts=t.type==='live'?40:240;for(let attempt=0;attempt<attempts;attempt++){const out=composeDetailed({language:t.language,difficulty,date,targetType:t.type,exam:t.exam,serial:n,attempt});content=out.content;contentHash=hash(content);const duplicateSlot=existsHash.get(contentHash),duplicateStored=knownHashes.has(contentHash),duplicateTopic=out.topicSignature&&existsTopic.get(out.topicSignature),recentSubject=out.baseSubject&&out.baseSubject!=='legacy'&&out.baseSubject!=='live'&&recentBase.get(out.baseSubject);if(!duplicateSlot&&!duplicateStored&&!duplicateTopic&&!recentSubject){meta=out;break}content=null;meta=null}if(!content)throw Error('Fresh passage unavailable');
   const title=meta?.topicTitle?`${date} • ${meta.topicTitle} • ${difficulty} • ${n}`:`${date} • ${t.exam.name} • ${t.language} • ${difficulty} • ${n}`;
   const pid=t.type==='live'?null:passage.run(title,t.language,t.exam.layout,difficulty,content,t.type==='exam'?(t.exam.highlight_mode||'none'):'current_char',t.type==='exam'?t.exam.id:null,t.type==='exam'?0:1,t.exam.default_result_count_mode||'word').lastInsertRowid;
   const qid=queue.run(date,qn,t.type,t.type==='exam'?t.exam.id:null,t.exam.name,t.language,difficulty,title,content,t.type==='live'?'pending':'published').lastInsertRowid;
   if(pid)db.prepare('UPDATE daily_passage_queue SET published_passage_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(pid,qid);slotInsert.run(slot,qid,pid,contentHash);if(meta?.topicSignature)insertTopic.run(meta.topicSignature,meta.topicFamily,meta.baseSubject,meta.topicTitle,t.type,t.type==='exam'?t.exam.id:null,t.language,difficulty);knownHashes.add(contentHash);created++;if(pid)published++;
  }}});tx();if(created)changed();return {created,published,date};
 }
 function refreshDate(date,targetTypes=null){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Invalid date');
  const allowed=Array.isArray(targetTypes)&&targetTypes.length?new Set(targetTypes.map(String)):null;
  const rows=db.prepare(`SELECT s.slot,s.queue_id,s.passage_id,s.content_hash,q.* FROM daily_auto_slots s JOIN daily_passage_queue q ON q.id=s.queue_id WHERE q.queue_date=? AND COALESCE(q.manual,0)=0 ORDER BY q.id`).all(date).filter(r=>!allowed||allowed.has(String(r.target_type||String(r.slot||'').split('|')[1]||'')));
  if(!rows.length)return {date,updated:0,skipped:0,owner_edited:0};
  const getExam=db.prepare('SELECT * FROM exams WHERE id=?');
  const getPassage=db.prepare('SELECT content FROM passages WHERE id=?');
  const otherSlot=db.prepare('SELECT 1 FROM daily_auto_slots WHERE content_hash=? AND slot<>?');
  const queueContents=db.prepare('SELECT id,content FROM daily_passage_queue WHERE id<>?');
  const passageContents=db.prepare('SELECT id,content FROM passages WHERE id<>?');
  const existsTopicRefresh=db.prepare('SELECT 1 FROM daily_topic_history WHERE signature=?');
  const recentBaseRefresh=db.prepare('SELECT 1 FROM (SELECT base_subject FROM daily_topic_history WHERE base_subject IS NOT NULL ORDER BY id DESC LIMIT 36) WHERE base_subject=? LIMIT 1');
  const insertTopicRefresh=db.prepare('INSERT OR IGNORE INTO daily_topic_history(signature,family,base_subject,title,target_type,exam_id,language,difficulty) VALUES(?,?,?,?,?,?,?,?)');
  const updateQueue=db.prepare('UPDATE daily_passage_queue SET title=?,content=?,difficulty=? WHERE id=?');
  const updatePassage=db.prepare('UPDATE passages SET title=?,content=?,difficulty=? WHERE id=?');
  const updateSlot=db.prepare('UPDATE daily_auto_slots SET content_hash=? WHERE slot=?');
  let updated=0,skipped=0,ownerEdited=0;
  const tx=db.transaction(()=>{for(const row of rows){
    // If an owner edited an automatically generated matter after creation, preserve that edit.
    const queueHash=hash(row.content);if(row.content_hash&&queueHash!==row.content_hash){ownerEdited++;continue}
    if(row.published_passage_id){const p=getPassage.get(row.published_passage_id);if(p&&row.content_hash&&hash(p.content)!==row.content_hash){ownerEdited++;continue}}
    const parts=String(row.slot||'').split('|');if(parts.length<6){skipped++;continue}
    const targetType=['exam','practice','live'].includes(parts[1])?parts[1]:row.target_type;
    const language=['English','Hindi'].includes(row.language)?row.language:parts[3];
    const difficulty=LEVELS.includes(row.difficulty)?row.difficulty:parts[4];
    const serial=Math.max(1,Number(parts[5])||1);
    let exam;
    if(targetType==='exam')exam=getExam.get(Number(row.exam_id)||Number(parts[2])||0);
    else exam={id:0,name:targetType==='live'?'Live Typing':'Typing Practice',layout:language==='Hindi'?'Unicode / Mangal':'QWERTY'};
    if(!exam||!['English','Hindi'].includes(language)||!LEVELS.includes(difficulty)){skipped++;continue}
    let content=null,contentHash='',meta=null;
    for(let attempt=0;attempt<240;attempt++){
      const out=composeDetailed({language,difficulty,date,targetType,exam,serial,attempt}),candidate=out.content,h=hash(candidate);if(otherSlot.get(h,row.slot))continue;
      const duplicateQueue=queueContents.all(row.id).some(x=>hash(x.content)===h);
      const duplicatePassage=passageContents.all(row.published_passage_id||0).some(x=>hash(x.content)===h);
      const duplicateTopic=out.topicSignature&&existsTopicRefresh.get(out.topicSignature),recentSubject=out.baseSubject&&out.baseSubject!=='legacy'&&out.baseSubject!=='live'&&recentBaseRefresh.get(out.baseSubject);
      if(duplicateQueue||duplicatePassage||duplicateTopic||recentSubject)continue;content=candidate;contentHash=h;meta=out;break;
    }
    if(!content){skipped++;continue}
    const title=meta?.topicTitle?`${date} • ${meta.topicTitle} • ${difficulty} • ${serial}`:`${date} • ${exam.name} • ${language} • ${difficulty} • ${serial}`;
    updateQueue.run(title,content,difficulty,row.id);
    if(row.published_passage_id)updatePassage.run(title,content,difficulty,row.published_passage_id);
    updateSlot.run(contentHash,row.slot);if(meta?.topicSignature)insertTopicRefresh.run(meta.topicSignature,meta.topicFamily,meta.baseSubject,meta.topicTitle,targetType,targetType==='exam'?exam.id:null,language,difficulty);updated++;
  }});tx();if(updated)changed();return {date,updated,skipped,owner_edited:ownerEdited};
 }

 // One-time Practice-only refresh: replace older published auto matter without losing
 // a candidate's historical result or overwriting owner-edited passages.
 // Also renew the ten original short built-in Free Practice examples, if still short.
 function refreshExistingPracticeMatter(maxDate=indiaDateParts().date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(maxDate))throw Error('Invalid date');
  const targetWords=language=>PRACTICE_30_MIN_WORDS[language]||0;
  const autoRows=db.prepare(`SELECT s.slot,s.queue_id,s.passage_id,s.content_hash,q.queue_date,q.target_type,q.language,q.difficulty,q.content queue_content,q.published_passage_id,
   p.id existing_id,p.active,p.title,p.content passage_content,p.layout,p.highlight_mode,p.auto_scroll,p.result_count_mode
   FROM daily_auto_slots s JOIN daily_passage_queue q ON q.id=s.queue_id
   JOIN passages p ON p.id=q.published_passage_id
   WHERE q.target_type='practice' AND q.queue_date<=? AND COALESCE(q.manual,0)=0 AND p.exam_id IS NULL AND p.active=1
   ORDER BY q.queue_date,q.id`).all(maxDate);
  const originalExamples=db.prepare(`SELECT p.id existing_id,p.title,p.language,p.difficulty,p.layout,p.content passage_content,p.highlight_mode,p.auto_scroll,p.result_count_mode
   FROM passages p WHERE p.exam_id IS NULL AND p.active=1 AND (
   p.title GLOB 'Free Practice English [1-5]' OR p.title GLOB 'Free Practice Hindi [1-5]') ORDER BY p.id`).all()
   .filter(r=>targetWords(r.language)>0&&wordCount(r.passage_content)<targetWords(r.language));
  const resultCount=db.prepare('SELECT COUNT(*) n FROM results WHERE passage_id=?');
  const archive=db.prepare('UPDATE passages SET active=0 WHERE id=? AND active=1');
  const updatePassage=db.prepare('UPDATE passages SET title=?,content=? WHERE id=?');
  const insertPassage=db.prepare(`INSERT INTO passages(title,language,layout,difficulty,content,active,highlight_mode,exam_id,auto_scroll,result_count_mode)
   VALUES(?,?,?,?,?,1,?,NULL,?,?)`);
  const updateQueue=db.prepare('UPDATE daily_passage_queue SET title=?,content=?,published_passage_id=? WHERE id=?');
  const updateSlot=db.prepare('UPDATE daily_auto_slots SET passage_id=?,content_hash=? WHERE slot=?');
  const topicInsert=db.prepare('INSERT OR IGNORE INTO daily_topic_history(signature,family,base_subject,title,target_type,exam_id,language,difficulty) VALUES(?,?,?,?,NULL, NULL,?,?)');
  // Existing records across ALL modes are included so refreshed Practice cannot duplicate Exam or other Practice matter.
  const known=new Set();
  for(const x of db.prepare('SELECT content FROM passages WHERE content IS NOT NULL').all())known.add(hash(x.content));
  for(const x of db.prepare('SELECT content FROM daily_passage_queue WHERE content IS NOT NULL').all())known.add(hash(x.content));
  const usedTopics=new Set(db.prepare('SELECT signature FROM daily_topic_history').all().map(x=>x.signature));
  let updated=0,replacedForHistory=0,examplesUpdated=0,examplesReplaced=0,ownerEdited=0,skipped=0;
  const refreshRow=(row,example)=>{
   const lang=row.language,level=LEVELS.includes(row.difficulty)?row.difficulty:'Medium';
   if(!targetWords(lang)){skipped++;return}
   if(!example){
    if(!row.content_hash||hash(row.queue_content)!==row.content_hash||hash(row.passage_content)!==row.content_hash){ownerEdited++;return}
   }
   const pieces=String(row.slot||'').split('|');
   const serial=example?(1000+Number(row.existing_id)):(Math.max(1,Number(pieces[5])||1));
   const date=example?maxDate:row.queue_date;
   let candidate=null;
   for(let attempt=0;attempt<260;attempt++){
    const out=composeDetailed({language:lang,difficulty:level,date,targetType:'practice',exam:{id:0,name:'Typing Practice',layout:lang==='Hindi'?'Unicode / Mangal':'QWERTY'},serial,attempt:attempt+2000});
    const h=hash(out.content);
    if(known.has(h)||out.topicSignature&&usedTopics.has(out.topicSignature))continue;
    candidate={...out,h};break;
   }
   if(!candidate){skipped++;return}
   const hasHistory=Number(resultCount.get(row.existing_id)?.n||0)>0;
   const title=example?row.title:`${row.queue_date} • ${candidate.topicTitle} • ${level} • ${serial}`;
   let pid=row.existing_id;
   if(hasHistory){
    archive.run(pid);
    pid=insertPassage.run(title,lang,row.layout|| (lang==='Hindi'?'Unicode / Mangal':'QWERTY'),level,candidate.content,row.highlight_mode||'current_char',Number(row.auto_scroll??1),row.result_count_mode||'word').lastInsertRowid;
    if(example)examplesReplaced++;else replacedForHistory++;
   }else{
    updatePassage.run(title,candidate.content,pid);
    if(example)examplesUpdated++;else updated++;
   }
   if(!example){updateQueue.run(title,candidate.content,pid,row.queue_id);updateSlot.run(pid,candidate.h,row.slot)}
   known.add(candidate.h);if(candidate.topicSignature){usedTopics.add(candidate.topicSignature);topicInsert.run(candidate.topicSignature,candidate.topicFamily,candidate.baseSubject,candidate.topicTitle,lang,level)}
  };
  // Small batches bound transaction time; existing Exam rows, Learning rows and all owner rows are untouched.
  for(let i=0;i<autoRows.length;i+=8)db.transaction(()=>autoRows.slice(i,i+8).forEach(row=>refreshRow(row,false)))();
  for(let i=0;i<originalExamples.length;i+=8)db.transaction(()=>originalExamples.slice(i,i+8).forEach(row=>refreshRow(row,true)))();
  const changedCount=updated+replacedForHistory+examplesUpdated+examplesReplaced;
  if(changedCount)changed();
  return {scanned_auto:autoRows.length,scanned_original_examples:originalExamples.length,updated,replaced_for_history:replacedForHistory,examples_updated:examplesUpdated,examples_replaced_for_history:examplesReplaced,owner_edited:ownerEdited,skipped};
 }

 // One-time historical Exam cleanup/refresh for the 21-Sep-2026 matter rules.
 // Scope is deliberately narrow: only auto-generated Exam rows are touched.
 // Practice, Live, Learning, manual/Owner-edited matter and every exam setting remain unchanged.
 async function refreshHistoricalExamMatter(maxDate=indiaDateParts().date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(maxDate)||new Date(maxDate+'T00:00:00Z').toISOString().slice(0,10)!==maxDate)throw Error('Invalid date');
  const rows=db.prepare(`SELECT s.slot,s.queue_id,s.passage_id,s.content_hash,q.* FROM daily_auto_slots s JOIN daily_passage_queue q ON q.id=s.queue_id WHERE q.target_type='exam' AND q.queue_date<=? AND COALESCE(q.manual,0)=0 ORDER BY q.queue_date,q.exam_id,q.language,q.difficulty,q.id`).all(maxDate);
  if(!rows.length)return {max_date:maxDate,updated:0,replaced_for_history:0,extras_archived:0,owner_edited:0,skipped:0};
  const getExam=db.prepare('SELECT * FROM exams WHERE id=?');
  const getPassage=db.prepare('SELECT content FROM passages WHERE id=?');
  const resultCount=db.prepare('SELECT COUNT(*) c FROM results WHERE passage_id=?');
  const updateQueue=db.prepare("UPDATE daily_passage_queue SET title=?,content=?,difficulty=?,status='published',reviewed_at=CURRENT_TIMESTAMP WHERE id=?");
  const updateQueueReplacement=db.prepare("UPDATE daily_passage_queue SET title=?,content=?,difficulty=?,status='published',published_passage_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?");
  const updatePassage=db.prepare('UPDATE passages SET title=?,content=?,difficulty=? WHERE id=?');
  const archivePassage=db.prepare('UPDATE passages SET active=0 WHERE id=?');
  const archiveQueue=db.prepare("UPDATE daily_passage_queue SET status='archived',reviewed_at=CURRENT_TIMESTAMP WHERE id=?");
  const deleteSlot=db.prepare('DELETE FROM daily_auto_slots WHERE slot=?');
  const updateSlot=db.prepare('UPDATE daily_auto_slots SET passage_id=?,content_hash=? WHERE slot=?');
  const insertPassage=db.prepare('INSERT INTO passages(title,language,layout,difficulty,content,active,highlight_mode,exam_id,auto_scroll,result_count_mode) VALUES(?,?,?,?,?,1,?,?,0,?)');
  // Keep exact uniqueness across every existing passage/queue and every replacement created in this run.
  const knownHashes=new Set();
  for(const r of db.prepare('SELECT content FROM passages WHERE content IS NOT NULL').all())knownHashes.add(hash(r.content));
  for(const r of db.prepare('SELECT content FROM daily_passage_queue WHERE content IS NOT NULL').all())knownHashes.add(hash(r.content));
  for(const r of db.prepare('SELECT content_hash FROM daily_auto_slots WHERE content_hash IS NOT NULL').all())knownHashes.add(String(r.content_hash));
  let updated=0,replacedForHistory=0,extrasArchived=0,ownerEdited=0,skipped=0;
  // Keep transactions deliberately small so Railway stays responsive and SQLite WAL cannot
  // grow to fill the persistent volume during a large historical refresh.
  const BATCH_SIZE=4;
  for(let start=0;start<rows.length;start+=BATCH_SIZE){
   const batch=rows.slice(start,start+BATCH_SIZE);
   const tx=db.transaction(()=>{for(const row of batch){
    const parts=String(row.slot||'').split('|');
    if(parts.length<6){skipped++;continue}
    const language=['English','Hindi'].includes(row.language)?row.language:parts[3];
    const difficulty=LEVELS.includes(row.difficulty)?row.difficulty:parts[4];
    const serial=Math.max(1,Number(parts[5])||1);
    const levelIndex=LEVELS.indexOf(difficulty);
    const exam=getExam.get(Number(row.exam_id)||Number(parts[2])||0);
    if(!exam||!['English','Hindi'].includes(language)||levelIndex<0){skipped++;continue}
    // Preserve any Owner edit to an auto-generated row.
    const queueHash=hash(row.content);if(row.content_hash&&queueHash!==row.content_hash){ownerEdited++;continue}
    if(row.published_passage_id){const p=getPassage.get(row.published_passage_id);if(p&&row.content_hash&&hash(p.content)!==row.content_hash){ownerEdited++;continue}}
    // New daily rule is exactly one Exam matter per difficulty. Older surplus auto rows are hidden,
    // never hard-deleted, so result/history references stay intact.
    const allowedCount=Math.max(0,Number(EXAM_COUNTS[levelIndex])||0);
    if(serial>allowedCount){
      if(row.published_passage_id)archivePassage.run(row.published_passage_id);
      archiveQueue.run(row.id);deleteSlot.run(row.slot);extrasArchived++;continue;
    }
    let content=null,contentHash='',meta=null;
    for(let attempt=0;attempt<240;attempt++){
      const out=composeDetailed({language,difficulty,date:row.queue_date,targetType:'exam',exam,serial,attempt}),candidate=out.content,h=hash(candidate);if(knownHashes.has(h))continue;content=candidate;contentHash=h;meta=out;break;
    }
    if(!content){skipped++;continue}
    const title=meta?.topicTitle?`${row.queue_date} • ${meta.topicTitle} • ${difficulty} • ${serial}`:`${row.queue_date} • ${exam.name} • ${language} • ${difficulty} • ${serial}`;
    const hasHistory=row.published_passage_id&&Number(resultCount.get(row.published_passage_id)?.c||0)>0;
    if(hasHistory){
      // Keep the exact old passage for historical results, but remove it from candidate lists.
      archivePassage.run(row.published_passage_id);
      const pid=insertPassage.run(title,language,exam.layout,difficulty,content,exam.highlight_mode||'none',exam.id,exam.default_result_count_mode||'word').lastInsertRowid;
      updateQueueReplacement.run(title,content,difficulty,pid,row.id);updateSlot.run(pid,contentHash,row.slot);replacedForHistory++;
    }else{
      updateQueue.run(title,content,difficulty,row.id);
      if(row.published_passage_id)updatePassage.run(title,content,difficulty,row.published_passage_id);
      updateSlot.run(row.published_passage_id||row.passage_id||null,contentHash,row.slot);updated++;
    }
    knownHashes.add(contentHash);
   }});
   tx();
   // Reclaim WAL space between batches when possible, then yield to HTTP/healthcheck traffic.
   try{db.pragma('wal_checkpoint(PASSIVE)')}catch(e){}
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  if(updated||replacedForHistory||extrasArchived)changed();
  return {max_date:maxDate,updated,replaced_for_history:replacedForHistory,extras_archived:extrasArchived,owner_edited:ownerEdited,skipped};
 }

 let lastKey='';function tick(now=new Date()){const ip=indiaDateParts(now),c=controls(),key=[ip.date,c.enabled,c.exam_enabled,c.practice_enabled,setting('live_daily_enabled')].join('|');if(ip.hour<10||!c.enabled||key===lastKey)return {created:0};const result=run(ip.date);lastKey=key;return result}
 function start(){const safe=()=>{try{tick()}catch(e){console.warn('Daily passages:',e.message)}};safe();const timer=setInterval(safe,60000);timer.unref?.();return timer}
 return {controls,setControls,run,refreshDate,refreshExistingPracticeMatter,refreshHistoricalExamMatter,tick,start};
}
