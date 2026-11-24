// Test verisi: her müşteri bir kuralı sınamak için tasarlandı. Tarihler bugüne göre hesaplanır.
(function(){
  const iso=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
  const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return iso(d)};
  const T=iso(new Date());
  const y=+T.slice(0,4),s=Date.UTC(y,0,1),n=Date.UTC(y,+T.slice(5,7)-1,+T.slice(8,10));
  const YF=y>2026?1:((n-s)/864e5+1)/((Date.UTC(y+1,0,1)-s)/864e5);
  const TODAYNAME=['','Pazartesi','Salı','Çarşamba','Perşembe','Cuma',''][new Date().getDay()];
  const base={chain:'',segment:'Bronze',status:'Aktif',statusManual:'',visitDay:'',freq:'',weeks:'',pay:'',contact:'',phone:'',address:'',postcode:'',city:'Rotterdam',notes:'',lastInvoiceNo:'',invoices2026:5,ciro2026:null,createdAt:1,updatedAt:1};
  const cust=(id,o)=>[id,{...base,code:id.slice(1),...o}];
  const customers=Object.fromEntries([
    cust('c1',{name:'Düşüş Market',rep:'Lütfi Kaplan',ciro2025:60000,sales2026:20000,lastInvoice:day(-10),visitDay:TODAYNAME,segment:'Gold'}),
    cust('c2',{name:'Sessiz Market',rep:'Lütfi Kaplan',ciro2025:24000,sales2026:Math.round(24000*YF),lastInvoice:day(-70)}),
    cust('c3',{name:'Sağlıklı Market',rep:'Mehmet Halici',ciro2025:50000,sales2026:Math.round(50000*YF),lastInvoice:day(-3),phone:'06 12345678',contact:'Ahmet Bey',address:'Kerkstraat 1',postcode:'1017 GA',city:'Amsterdam'}),
    cust('c4',{name:'Küçük Kiosk',rep:'Mehmet Halici',ciro2025:500,sales2026:100,lastInvoice:day(-100),segment:'Kiosk'}),
    cust('c5',{name:'Kayıp Market',rep:'Gökhan Genç',ciro2025:10000,sales2026:0,lastInvoice:day(-400),status:'Pasif'}),
    cust('c6',{name:'İadeci Market',rep:'Özgür Firat',ciro2025:30000,sales2026:Math.round(30000*YF),lastInvoice:day(-5),phone:'+31 6 98765432'}),
    cust('c7',{name:'Kapanan Market',rep:'Gökhan Genç',ciro2025:40000,sales2026:0,lastInvoice:day(-200),status:'Pasif',statusManual:'Pasif'}),
    cust('c8',{name:'Yeni Market',rep:'Baran Sengül',ciro2025:null,sales2026:5000,lastInvoice:day(-20)})
  ]);
  window.__SEED={
    customers,
    activities:{
      a1:{customerId:'c2',type:'Ziyaret',date:day(-20),rep:'Lütfi Kaplan',note:'Fiyat listesi istedi',amount:0,nextAction:'Fiyat konuş',nextDate:day(-1),done:false,createdAt:1},
      a2:{customerId:'c3',type:'Telefon',date:day(-2),rep:'Mehmet Halici',note:'Sipariş verdi',amount:0,nextAction:'',nextDate:'',done:false,createdAt:2}
    },
    sync:{
      month:{month:T.slice(0,7),updatedAt:T,map:{'1':[1200,2],'3':[5000,3],'6':[3000,1]}},
      returns:{from:y+'-01',to:T.slice(0,7),map:{'1':[15000,-300,2,0,0,10],'3':[40000,-400,1,0,0,30],'6':[20000,-2400,5,-100,1,20],'8':[5000,-150,1,0,0,4]}}
    }
  };
  window.__FIX={YF,TODAY:T,day,TODAYNAME};
})();
