'use strict';
// Offline daily passage composer: no API key, paid service or deployment-time seed replacement.
const crypto=require('crypto');
const LEVELS=['Easy','Medium','Moderate to Hard','Hard'];
const LIMITS={Easy:[2200,2400],Medium:[2600,3000],'Moderate to Hard':[3000,3400],Hard:[3500,4200]};
const EXAM_COUNTS=[1,1,1,1],PRACTICE_COUNTS=[1,1,1,1];
function rng(seed){let n=crypto.createHash('sha256').update(seed).digest().readUInt32LE();return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296}}
const contexts=[
 [/police|upp-co|asi|\bsi\b/i,['police office','citizen help desk','complaint register','duty officer','public safety'],['पुलिस कार्यालय','जन सहायता कक्ष','शिकायत पंजी','ड्यूटी अधिकारी','जन सुरक्षा']],
 [/railway|rrb|ntpc/i,['railway office','passenger help desk','journey register','station officer','passenger service'],['रेलवे कार्यालय','यात्री सहायता कक्ष','यात्रा पंजी','स्टेशन अधिकारी','यात्री सेवा']],
 [/court|judicial|legal/i,['court office','filing counter','case register','record clerk','record management'],['न्यायालय कार्यालय','दाखिला कक्ष','वाद पंजी','अभिलेख सहायक','अभिलेख प्रबंधन']],
 [/bank|ibps|sbi/i,['bank branch','customer help desk','service register','branch officer','customer service'],['बैंक कार्यालय','ग्राहक सहायता कक्ष','सेवा पंजी','शाखा अधिकारी','ग्राहक सेवा']],
 [/ssc|chsl|selection|recruit/i,['selection office','candidate help desk','application register','section officer','candidate support'],['चयन कार्यालय','अभ्यर्थी सहायता कक्ष','आवेदन पंजी','अनुभाग अधिकारी','अभ्यर्थी सहायता']],
 [/.*/,['district office','public help desk','receipt register','office assistant','public service'],['जिला कार्यालय','जन सहायता कक्ष','प्राप्ति पंजी','कार्यालय सहायक','जन सेवा']]
];
const topics=[['a clean water project','स्वच्छ जल योजना'],['a reading room','वाचन कक्ष'],['a village service camp','ग्राम सेवा शिविर'],['a school support programme','विद्यालय सहायता कार्यक्रम'],['a records improvement project','अभिलेख सुधार योजना'],['a community training centre','सामुदायिक प्रशिक्षण केंद्र'],['a public information room','जन सूचना कक्ष'],['a transport help centre','यातायात सहायता केंद्र'],['a tree planting programme','वृक्षारोपण कार्यक्रम'],['a staff training workshop','कर्मचारी प्रशिक्षण कार्यशाला'],['a neighbourhood resource centre','स्थानीय संसाधन केंद्र'],['a public library','सार्वजनिक पुस्तकालय'],['a digital service centre','डिजिटल सेवा केंद्र'],['a maintenance programme','रखरखाव कार्यक्रम'],['a citizen feedback meeting','नागरिक सुझाव बैठक'],['a rural learning centre','ग्रामीण अध्ययन केंद्र']];
function compose({language,difficulty,date,targetType,exam={},serial=1,attempt=0}){
 const random=rng([date,targetType,exam.id||0,exam.name||'',language,difficulty,serial,attempt].join('|')),pick=a=>a[Math.floor(random()*a.length)],number=(a,b)=>a+Math.floor(random()*(b-a+1));
 const hi=language==='Hindi',legacy=hi&&/kruti|devlys|chanakya/i.test(exam.layout||''),hard=difficulty==='Hard',moderate=difficulty==='Moderate to Hard',numeric=difficulty!=='Easy';
 const context=contexts.find(x=>x[0].test(exam.name||''))[hi?2:1], [office,desk,register,role,service]=context;
 const place=pick(hi?['रामपुर','माधवपुर','शिवपुर','आनंदपुर','गोपालपुर','विकास नगर','शांति नगर','सूरजपुर','हरिपुर','नवग्राम','कमलपुर','देवपुर']:['Rampur','Madhavpur','Shivpur','Anandpur','Gopalpur','Vikas Nagar','Shanti Nagar','Surajpur','Haripur','Navgram','Kamalpur','Devpur']);
 const topic=pick(topics)[hi?1:0],name=pick(hi?['रीना','सीमा','राधा','मीना','नीलम','कविता','आशा','पूजा','दीपा','गीता']:['Reena','Seema','Radha','Meena','Neelam','Kavita','Asha','Pooja','Deepa','Geeta']);
 const intro=hi?`${place} के ${office} में ${topic} से जुड़े काम की समीक्षा हुई। ${name} ने साथियों के साथ दिन की योजना बनाई। सभी ने तय किया कि आने वाले लोगों की बात ध्यान से सुनकर काम पूरा किया जाएगा।`:`The ${office} in ${place} held a review of work related to ${topic}. ${name} met the team to plan the day. They agreed to listen carefully to visitors and complete each task in a clear and orderly way.`;
 const simple=hi?[
  `${desk} के पास बैठने की जगह साफ थी। पानी का बर्तन भरा हुआ था। बाहर एक छोटा बोर्ड लगा था ताकि हर व्यक्ति सही कक्ष तक जा सके।`,
  `${name} ने सुबह आई डाक को मेज पर रखा। हर पत्र को खोलकर उसका विषय पढ़ा गया। जरूरी पत्र अलग रखे गए और शेष पत्र सही शाखा में भेजे गए।`,
  `एक बुजुर्ग व्यक्ति अपना आवेदन लेकर आए। उन्हें लिखने में मदद चाहिए थी। सहायक ने पहले उनकी बात सुनी और फिर साफ कागज पर उनका संदेश लिखा।`,
  `${register} में हर नए पत्र का विवरण लिखा गया। नाम और पता दोबारा पढ़े गए। इससे किसी दूसरे व्यक्ति के नाम से पत्र दर्ज होने की भूल नहीं हुई।`,
  `दल ने काम को छोटे भागों में बाँटा। किसी को पत्र पढ़ने थे और किसी को उत्तर तैयार करना था। साथ काम करने से दिन का काम समय पर पूरा हुआ।`,
  `दोपहर में कुछ लोग योजना की जानकारी लेने आए। उन्हें बताया गया कि सहायता कहाँ मिलेगी और आवेदन किस कक्ष में जमा होगा। सभी ने शांति से अपनी बारी का इंतजार किया।`,
  `${role} ने नए साथियों को पुरानी फाइल दिखाई। उन्होंने बताया कि साफ लिखावट और सही क्रम से रखे कागज काम को आसान बनाते हैं।`,
  `कक्ष में रोशनी अच्छी थी और मेज पर कम सामान था। काम के बीच थोड़ी देर हाथों को आराम दिया गया। फिर सभी ने पूरे ध्यान से अगला काम शुरू किया।`,
  `एक पत्र में गाँव का नाम साफ नहीं था। अनुमान लगाने की जगह मूल कागज देखा गया। सही नाम मिलने के बाद ही उसे पंजी में लिखा गया।`,
  `${topic} से जुड़े सुझाव अलग सूची में रखे गए। लोग चाहते थे कि सूचना सरल भाषा में मिले। दल ने अगले पत्र में कठिन शब्दों की जगह आम शब्द रखने का निश्चय किया।`,
  `सहायक ने खाली कागज और भरे हुए पत्र अलग रखे। तैयार उत्तर पर नाम और विषय जाँचा गया। फिर उसे भेजने के लिए सही लिफाफे में रखा गया।`,
  `किसी व्यक्ति को एक ही बात बार बार न बतानी पड़े इसलिए मुख्य जानकारी बोर्ड पर लिखी गई। जो लोग पढ़ नहीं सकते थे उन्हें बात समझाकर बताई गई।`,
  `एक साथी के पास काम अधिक था। दूसरे साथी ने अपना काम पूरा करके उसकी मदद की। दोनों ने मिलकर बचे हुए कागज सही क्रम में रख दिए।`,
  `शाम से पहले पूरे कक्ष की जाँच की गई। खुली फाइलें बंद की गईं और जरूरी कागज सुरक्षित रखे गए। अगले दिन के लिए मेज पर केवल काम की सूची छोड़ी गई।`,
  `${service} में धैर्य और साफ बातचीत की जरूरत होती है। हर व्यक्ति का काम ध्यान से सुनना चाहिए। छोटा काम भी समय पर हो तो लोगों का भरोसा बढ़ता है।`,
  `दल ने पिछले दिन की भूल पर चर्चा की। किसी को दोष देने की जगह सही तरीका समझाया गया। नए साथी ने उसी तरीके से अगला पत्र बिना भूल के तैयार किया।`,
  `एक परिवार दूर गाँव से आया था। उन्हें सही शाखा तक भेजने से पहले पूरी बात समझी गई। इस छोटे प्रयास से उनका समय बचा और काम आसानी से हो गया।`,
  `कक्ष के बाहर पेड़ की छाया थी। कुछ लोग वहाँ आराम कर रहे थे। सहायक ने जाकर पूछा कि किसी को पानी या दिशा बताने की मदद तो नहीं चाहिए।`,
  `दिन के अंत में सभी ने अपने काम का छोटा विवरण दिया। जो काम बाकी था उसे अलग लिखा गया। अगली सुबह उसी सूची से काम शुरू करने का फैसला हुआ।`,
  `पुराने कागजों को साफ कपड़े से पोंछकर रखा गया। फटे हुए कवर बदले गए। हर फाइल पर विषय लिखा गया जिससे जरूरत पड़ने पर उसे जल्दी ढूँढ़ा जा सके।`
 ]:[
  `The ${desk} was clean and easy to find. A small board showed visitors where to go. Fresh water and a few chairs were ready for people who needed to wait.`,
  `${name} placed the morning post on the desk. Each letter was opened and read with care. Urgent items were kept apart while the other letters went to the right section.`,
  `An older visitor needed help with a form. The assistant first listened to the full request. The details were then written clearly and read back so the visitor could check them.`,
  `Each new letter was entered in the ${register}. Names and addresses were read twice. This simple habit helped the team avoid sending a reply to the wrong person.`,
  `The team split the work into small tasks. Some people read letters while others prepared replies. Working together helped them finish the main tasks without rushing.`,
  `Several visitors came to ask about the project. They were shown where to submit a form and whom to ask for help. Each person was given enough time to explain the problem.`,
  `The ${role} showed new staff how to arrange a file. A clear heading and the correct order made each record easy to read. No loose sheet was left on the desk.`,
  `The room had good light and enough space to work. Staff rested their hands for a short time between tasks. They returned to the next letter with fresh attention.`,
  `A village name was hard to read on a copy. The assistant checked the original sheet instead of guessing. The correct name was entered only after it was clear.`,
  `Suggestions about ${topic} were kept on a separate list. People asked for simple words in public notices. The team decided to make the next notice shorter and clearer.`,
  `Blank forms and completed letters were placed in separate trays. Before a reply was sent the name and subject were checked. The letter was then put in the correct cover.`,
  `The most common questions were answered on the notice board. Staff also explained the same points to visitors who could not read. This saved people from asking at several desks.`,
  `One member of the team had more work than the others. A colleague offered help after finishing her own list. Together they placed the remaining papers in the proper order.`,
  `Before leaving the office the team checked the room. Open files were closed and important papers were stored safely. Only the next day work list was left on the table.`,
  `Good ${service} needs patience and clear speech. Even a small request should be heard with care. People gain trust when they receive a useful reply at the right time.`,
  `The team discussed a mistake from the previous day. The focus was on finding a better method. A new assistant followed that method and prepared the next reply correctly.`,
  `A family had travelled from a distant village. Staff understood their request before guiding them to another section. A few careful questions saved the family a second journey.`,
  `There was a shady tree outside the office. Some visitors rested there while they waited. The assistant checked whether anyone needed water or help finding the right room.`,
  `At the end of the day each worker gave a short account of completed tasks. Unfinished items were listed separately. The team agreed to start with that list the next morning.`,
  `Old file covers were cleaned and torn covers were replaced. Each file received a clear subject label. Staff could then find a record quickly without opening every folder.`
 ];
 const complex=hi?[
  `अभिलेखों के डिजिटलीकरण से पहले मूल दस्तावेज, संलग्नक और प्राप्ति विवरण का क्रमवार मिलान किया गया। अस्पष्ट प्रविष्टि मिलने पर संबंधित शाखा से पुष्टि माँगी गई, ताकि अपूर्ण सूचना के आधार पर कोई अनावश्यक निर्णय न लिया जाए।`,
  `समन्वय बैठक में उत्तरदायित्व, कार्यप्रवाह और समयबद्ध निस्तारण पर चर्चा हुई। पर्यवेक्षक ने स्पष्ट किया कि सुधार का उद्देश्य केवल लंबित मामलों की संख्या घटाना नहीं, बल्कि नागरिकों को सुसंगत और उपयोगी उत्तर उपलब्ध कराना है।`,
  `प्रारूप की पुनः जाँच में वर्तनी, विराम चिह्न, संदर्भ और संलग्न पृष्ठों का विशेष ध्यान रखा गया। अनुमोदन के बाद संशोधित प्रति निर्धारित स्थान पर सुरक्षित की गई और पुराने प्रारूप को स्पष्ट पहचान के साथ अलग रखा गया।`,
  `गोपनीय जानकारी की अनधिकृत प्रतिलिपि बनाने से बचने के लिए कार्यस्थल पर सावधानी रखी गई। प्रशिक्षक ने समझाया कि सही अभिलेखन, सीमित पहुँच और उत्तरदायी व्यवहार दैनिक प्रशासनिक कार्य की आवश्यक विशेषताएँ हैं।`,
  `जनसंपर्क अनुभाग ने प्राप्त सुझावों का विषयवार वर्गीकरण किया। दोहराए गए प्रश्नों को एकत्र करके सरल उत्तर तैयार किए गए, जबकि विशेष परिस्थितियों वाले आवेदनों को विस्तृत परीक्षण के लिए संबंधित अधिकारी के समक्ष प्रस्तुत किया गया।`,
  `संसाधनों के समुचित उपयोग हेतु प्रस्तावित गतिविधियों की प्राथमिकता निर्धारित की गई। बैठक में उपलब्ध साधनों, संभावित व्यवधानों और वैकल्पिक व्यवस्था पर विचार हुआ; प्रत्येक निर्णय के साथ उत्तरदायी अनुभाग का उल्लेख किया गया।`,
  `सत्यापन की प्रक्रिया पूरी होने के बाद प्रेषण सूची अद्यतन की गई। यदि किसी विवरण में संशोधन आवश्यक था, तो मूल प्रविष्टि मिटाने के बजाय परिवर्तन का कारण और संदर्भ सुरक्षित रखा गया। इससे बाद की समीक्षा में स्थिति स्पष्ट रही।`,
  `कार्यशाला में एकाग्रता, शुद्ध टंकण और दस्तावेज की पठनीयता पर अभ्यास कराया गया। प्रतिभागियों ने संयुक्त अक्षर, प्रशासनिक शब्दावली और मिश्रित संख्याओं वाले वाक्यों को सावधानी से पढ़कर डिजिटल प्रति तैयार की।`
 ]:[
  `Before digitisation began, the original documents, enclosures and receipt details were compared in sequence. An unclear entry was referred to the responsible section for confirmation, preventing an incomplete record from becoming the basis of an unnecessary decision.`,
  `The coordination meeting considered responsibility, workflow and timely disposal of requests. The supervisor explained that improvement meant more than reducing the number of pending files; it also required consistent and useful replies to the people concerned.`,
  `The revised draft was checked for spelling, punctuation, references and attached pages. After approval, the corrected copy was stored in its assigned location, while the earlier draft was retained with a clear label to prevent confusion during subsequent review.`,
  `Staff handled confidential information carefully and avoided making unauthorised copies. The trainer explained that accurate records, appropriate access and accountable behaviour were essential parts of routine administrative work, even when a task appeared straightforward.`,
  `The public relations section classified suggestions by subject. Repeated questions were grouped to prepare concise replies, while requests involving unusual circumstances were presented to the responsible officer for a more detailed examination.`,
  `Proposed activities were prioritised to make sensible use of available resources. The discussion covered likely interruptions and alternative arrangements; each decision named the section responsible for implementation and follow-up.`,
  `Once verification was complete, the dispatch list was updated. Whenever a detail needed correction, the reason and reference were recorded instead of silently replacing the earlier entry. This preserved a clear account for future examination.`,
  `The workshop combined concentration, accurate typing and readable document preparation. Participants practised longer words and mixed numerical expressions, checking each sentence against the source before submitting their digital copy.`
 ];
 const numericText=hi?`पंजी में संदर्भ (${number(100,999)}-${number(1000,9999)}), कक्ष ${number(1,9)} और संपर्क कोड 0123456789 दर्ज किया गया। सूची के ${number(10,29)} आवेदन जाँचे गए, फिर शेष ${number(2,9)} आवेदन अगले दल को दिए गए।`:`The register recorded reference (${number(100,999)}-${number(1000,9999)}), room ${number(1,9)} and contact code 0123456789. Staff checked ${number(10,29)} applications, then handed the remaining ${number(2,9)} to the next team.`;
 const hardText=hi?`समीक्षा विवरण: मद (${number(11,99)}), प्रपत्र ${number(100,999)}-${number(1000,9999)}, प्रगति ${number(61,98)}% और राशि ${number(12,98)},${number(100,999)}.50 रुपये। पर्यवेक्षण टिप्पणी में लिखा गया: "प्राप्ति, परीक्षण और निस्तारण - तीनों चरणों का मिलान करें"; अपूर्ण संलग्नक वाले प्रकरण अलग रखे गए।`:`Review details: item (${number(11,99)}), form ${number(100,999)}-${number(1000,9999)}, progress ${number(61,98)}% and allocation Rs. ${number(12,98)},${number(100,999)}.50. The supervisor wrote: "Compare receipt, verification and disposal - all three stages"; records with incomplete enclosures were placed in a separate tray.`;
 let bank=[...simple];for(let i=bank.length-1;i>0;i--){const j=number(0,i);[bank[i],bank[j]]=[bank[j],bank[i]]}if(hard||moderate){const advanced=[...complex];for(let i=advanced.length-1;i>0;i--){const j=number(0,i);[advanced[i],advanced[j]]=[advanced[j],advanced[i]]}bank=[...advanced.slice(0,hard?4:2),...bank,...advanced.slice(hard?4:2)]}
 let content=intro+(numeric?' '+numericText:'')+(hard?' '+hardText:'');const [min,max]=LIMITS[difficulty],target=number(min,Math.max(min,max-180));
 if(legacy){
  // Legacy tracks use encoded text, never Unicode mislabeled as a legacy font.
  bank=[`ljdkjh dk;kZy; esa vkosnu vkSj i=kpkj dk dk;Z /;ku ls fd;k tkrk gSA`,`Hkkjr esa fMftVy lsokvksa dk foLrkj rsth ls gks jgk gSA`,`fu;fer vH;kl ls Vad.k dh xfr vkSj 'kq)rk esa lq/kkj gksrk gSA`,`ijh{kk ds nkSjku 'kkar jgsa vkSj ewy ikB dks /;ku ls i<+saA`,`dk;kZy; esa le; ij vkdj viuk dk;Z iwjk djuk pkfg,A`,`izR;sd i= dks i<+dj mldk fooj.k ntZ fd;k x;kA`,`lHkh vkosnu lgh foHkkx esa Hksts x,A`,`uke vkSj irk fQj ls tk¡pdj mRrj rS;kj fd;k x;kA`,`dEI;wVj vk/kkfjr dk;Z ds fy, dq'ky Vkbfiax dk fo'ks"k egRo gSA`,`vfHkys[k lqjf{kr j[kus ls vko';d tkudkjh le; ij feyrh gSA`,`izf'k{k.k ds ckn lHkh us viuk dk;Z /;ku ls iwjk fd;kA`,`vH;FkhZ dks 'kCn Øe vkSj fojke fpg~u lqjf{kr j[kus pkfg,A`];
  // Compose fresh groups of complete legacy sentences; a group occurs only once.
  const subjects=['vkosnu','i=','vfHkys[k','fooj.k','izLrko','lwpuk','lq>ko','izfrosnu','dk;ZØe','izk:i',"izf'k{k.k",'iath'],actions=['dh tk¡p /;ku ls dh xbZ','ds fooj.k dks i<+dj lgh LFkku ij j[kk x;k','ls lacaf/kr tkudkjh lHkh dks nh xbZ','dk fooj.k iath esa ntZ fd;k x;k',"ds fy, vko';d dkxt rS;kj fd, x,",'ls lacaf/kr dk;Z le; ij iwjk fd;k x;k','dh izfr lqjf{kr LFkku ij j[kh xbZ','dk lkj la{ksi esa fy[kk x;k',"ls lacaf/kr i= lgh 'kk[kk esa Hkstk x;k",'dh tk¡p ds ckn vxys dk;Z ij /;ku fn;k x;k'];const groups=[];for(const subject of subjects)for(const action of actions)groups.push(subject+' '+action+'A');for(let i=groups.length-1;i>0;i--){const j=number(0,i);[groups[i],groups[j]]=[groups[j],groups[i]]}bank=groups;content=numeric?`Øekad (${number(100,999)}-${number(1000,9999)})] fooj.k 0123456789] fnukad ${date}A`:bank.pop();
 }
 for(const paragraph of bank){if(content.length>=target)break;if(content.length+paragraph.length+1<=max)content+=' '+paragraph}
 const fillers=legacy?['dk;Z iwjk gqvkA','lHkh us /;ku fn;kA']:hi?['सभी ने ध्यान से काम किया।','अगले दिन फिर बैठक हुई।','काम समय पर पूरा हुआ।','हर बात साफ लिखी गई।','दल ने अपनी सूची जाँची।','लोग संतुष्ट होकर लौटे।','साथियों ने मिलकर मदद की।','दिन का काम समाप्त हुआ।']:['The team checked the work.','The next task was ready.','Everyone read the final note.','The room was left clean.','Staff agreed on the next step.','The visitors thanked the team.','Each reply was clear.','The work ended on time.'];
 for(const line of fillers){if(content.length>=min)break;if(content.length+line.length+1<=max)content+=' '+line}
 if(content.length<min||content.length>max)throw Error('Daily passage length could not be satisfied');return content;
}
module.exports={compose,LEVELS,LIMITS,EXAM_COUNTS,PRACTICE_COUNTS,createService};
function createService(db,{setting,indiaDateParts}){
 db.exec(`CREATE TABLE IF NOT EXISTS daily_auto_slots(slot TEXT PRIMARY KEY,queue_id INTEGER,passage_id INTEGER,content_hash TEXT NOT NULL UNIQUE,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
 const hash=s=>crypto.createHash('sha256').update(String(s).replace(/\s+/g,' ').trim()).digest('hex');
 const upsert=db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP");
 // Explicitly requested new auto-publish replaces the previously disabled draft-only scheduler once.
 if(setting('daily_auto_v2_installed')!=='1')db.transaction(()=>{upsert.run('daily_queue_enabled','1');upsert.run('daily_queue_skip_date','');upsert.run('daily_auto_practice_enabled','1');upsert.run('daily_auto_exam_enabled','1');upsert.run('daily_auto_v2_installed','1')})();
 function controls(){return {enabled:setting('daily_queue_enabled')!=='0',exam_enabled:setting('daily_auto_exam_enabled')!=='0',practice_enabled:setting('daily_auto_practice_enabled')!=='0',today:indiaDateParts().date,skip_date:'',time:'10:00 Asia/Kolkata'}}
 function setControls(b){db.transaction(()=>{for(const [key,field] of [['daily_queue_enabled','enabled'],['daily_auto_exam_enabled','exam_enabled'],['daily_auto_practice_enabled','practice_enabled']])if(typeof b[field]==='boolean')upsert.run(key,b[field]?'1':'0');upsert.run('daily_queue_skip_date','')})();return controls()}
 function run(date=indiaDateParts().date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Invalid date');
  const c=controls();if(!c.enabled)return {created:0,date,skipped:true};
  const targets=[];
  if(c.exam_enabled)for(const ex of db.prepare("SELECT * FROM exams WHERE active=1 AND slug NOT LIKE 'live-template-%'").all())if(['English','Hindi'].includes(ex.language))targets.push({type:'exam',exam:ex,language:ex.language,counts:EXAM_COUNTS});
  if(setting('live_daily_enabled')==='1')for(const language of ['English','Hindi'])targets.push({type:'live',exam:{id:0,name:'Live Typing',layout:language==='Hindi'?'Unicode / Mangal':'QWERTY'},language,counts:[2,2,0,2]});
  if(c.practice_enabled)for(const language of ['English','Hindi'])targets.push({type:'practice',exam:{id:0,name:'Typing Practice',layout:language==='Hindi'?'Unicode / Mangal':'QWERTY'},language,counts:PRACTICE_COUNTS});
  const findSlot=db.prepare('SELECT 1 FROM daily_auto_slots WHERE slot=?'),existsHash=db.prepare('SELECT 1 FROM daily_auto_slots WHERE content_hash=?');
  const queue=db.prepare("INSERT INTO daily_passage_queue(queue_date,queue_no,target_type,exam_id,exam_name,language,difficulty,title,content,status,manual) VALUES(?,?,?,?,?,?,?,?,?,?,0)");
  const passage=db.prepare('INSERT INTO passages(title,language,layout,difficulty,content,active,highlight_mode,exam_id,auto_scroll,result_count_mode) VALUES(?,?,?,?,?,1,?,?,?,?)');
  const slotInsert=db.prepare('INSERT INTO daily_auto_slots(slot,queue_id,passage_id,content_hash) VALUES(?,?,?,?)');
  let created=0,published=0;const tx=db.transaction(()=>{for(const t of targets){let qn=100;for(let l=0;l<LEVELS.length;l++)for(let n=1;n<=t.counts[l];n++){
   qn++;const difficulty=LEVELS[l],slot=[date,t.type,t.exam.id,t.language,difficulty,n].join('|');if(findSlot.get(slot))continue;
   let content,contentHash;for(let attempt=0;attempt<30;attempt++){content=compose({language:t.language,difficulty,date,targetType:t.type,exam:t.exam,serial:n,attempt});contentHash=hash(content);if(!existsHash.get(contentHash))break;content=null}if(!content)throw Error('Fresh passage unavailable');
   const title=`${date} • ${t.exam.name} • ${t.language} • ${difficulty} • ${n}`;
   const pid=t.type==='live'?null:passage.run(title,t.language,t.exam.layout,difficulty,content,t.type==='exam'?(t.exam.highlight_mode||'none'):'current_char',t.type==='exam'?t.exam.id:null,t.type==='exam'?0:1,t.exam.default_result_count_mode||'word').lastInsertRowid;
   const qid=queue.run(date,qn,t.type,t.type==='exam'?t.exam.id:null,t.exam.name,t.language,difficulty,title,content,t.type==='live'?'pending':'published').lastInsertRowid;
   if(pid)db.prepare('UPDATE daily_passage_queue SET published_passage_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(pid,qid);slotInsert.run(slot,qid,pid,contentHash);created++;if(pid)published++;
  }}});tx();return {created,published,date};
 }
 let lastKey='';function tick(now=new Date()){const ip=indiaDateParts(now),c=controls(),key=[ip.date,c.enabled,c.exam_enabled,c.practice_enabled,setting('live_daily_enabled')].join('|');if(ip.hour<10||!c.enabled||key===lastKey)return {created:0};const result=run(ip.date);lastKey=key;return result}
 function start(){const safe=()=>{try{tick()}catch(e){console.warn('Daily passages:',e.message)}};safe();const timer=setInterval(safe,60000);timer.unref?.();return timer}
 return {controls,setControls,run,tick,start};
}
