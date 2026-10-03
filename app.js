/* app.js - Digiherbaarion päälogiikka */

const dbName = "DigiHerbaarioDB";
let db;

// --- Koulujen ja kurssien kasvilistat ---
const kouluData = {
  "hatanpaa_7lk": {
    nimi: "Hatanpään koulu - 7. luokan biologia",
    kasvit: ["Valkovuokko", "Kielo", "Siankärsämö", "Mustikka", "Voikukka", "Leskenlehti", "Oravanmarja", "Metsätähti"]
  },
  "tampere_ammatti": {
    nimi: "Tampereen Ammattiopisto - Puutarhuri 1",
    kasvit: ["Rauduskoivu", "Mänty", "Kuusi", "Harmaaleppä", "Pihlaja", "Vaahtera", "Kangasajuruoho", "Piharatamo"]
  }
};

// --- 1. TIETOKANNAN ALUSTUS (IndexedDB) ---
const request = indexedDB.open(dbName, 1);

request.onupgradeneeded = function(e) {
  db = e.target.result;
  if (!db.objectStoreNames.contains("havainnot")) {
    db.createObjectStore("havainnot", { keyPath: "id", autoIncrement: true });
  }
};

request.onsuccess = function(e) {
  db = e.target.result;
  naytaKasvit();
  paivitaEdistyminen();
};

request.onerror = function(e) {
  console.error("Tietokantavirhe:", e.target.error);
};

// --- 2. KOULULISTAN JA EDISTYMISEN LOGIIKKA ---
document.getElementById("koulu-valinta").addEventListener("change", function(e) {
  const valittuKoulu = e.target.value;
  localStorage.setItem("valittuKoulu", valittuKoulu);
  paivitaEdistyminen();
});

function paivitaEdistyminen() {
  const valittuKoulu = localStorage.getItem("valittuKoulu");
  const nakyma = document.getElementById("edistymis-nakyma");
  const selectElem = document.getElementById("koulu-valinta");
  const datalist = document.getElementById("kasvi-ehdotukset");

  if (valittuKoulu) {
    selectElem.value = valittuKoulu;
  }

  if (!valittuKoulu || !kouluData[valittuKoulu]) {
    nakyma.style.display = "none";
    if(datalist) datalist.innerHTML = ""; 
    return;
  }

  nakyma.style.display = "block";
  const vaaditutKasvit = kouluData[valittuKoulu].kasvit;

  if(datalist) {
    datalist.innerHTML = "";
    vaaditutKasvit.forEach(kasvi => {
      const option = document.createElement("option");
      option.value = kasvi;
      datalist.appendChild(option);
    });
  }

  if (!db) return; 
  
  const transaction = db.transaction(["havainnot"], "readonly");
  const store = transaction.objectStore("havainnot");
  const requestStore = store.getAll();

  requestStore.onsuccess = function() {
    const tallennetutLajit = requestStore.result.map(havainto => havainto.laji.toLowerCase().trim());
    const tagContainer = document.getElementById("kasvi-tagit");
    if(!tagContainer) return;

    tagContainer.innerHTML = "";
    let keratytLkm = 0;

    vaaditutKasvit.forEach(vaadittu => {
      const span = document.createElement("span");
      span.textContent = vaadittu;
      span.className = "kasvi-tag";

      if (tallennetutLajit.includes(vaadittu.toLowerCase().trim())) {
        span.classList.add("keratty");
        keratytLkm++;
      }
      tagContainer.appendChild(span);
    });

    document.getElementById("keratty-lkm").textContent = keratytLkm;
    document.getElementById("yhteensa-lkm").textContent = vaaditutKasvit.length;
  };
}

// --- 3. LOMAKKEEN ESI-TÄYTTÖ JA GPS-PAIKANNUS ---
window.addEventListener("DOMContentLoaded", () => {
  const tanaan = new Date().toISOString().split('T')[0];
  const pvmKentta = document.getElementById("pvm");
  if(pvmKentta) pvmKentta.value = tanaan;
  
  const tallennettuNimi = localStorage.getItem("oppilaanNimi");
  const oppilasKentta = document.getElementById("oppilas");
  if (tallennettuNimi && oppilasKentta) {
    oppilasKentta.value = tallennettuNimi;
  }
});

const btnGps = document.getElementById('btn-gps');
if(btnGps) {
  btnGps.addEventListener('click', () => {
    const tulos = document.getElementById('gps-tulos');
    tulos.textContent = "Haetaan sijaintia...";
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          document.getElementById('lat').value = pos.coords.latitude;
          document.getElementById('lng').value = pos.coords.longitude;
          tulos.textContent = `✅ Sijainti lukittu: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          tulos.style.color = "green";
        },
        (err) => {
          tulos.textContent = "❌ Paikannus epäonnistui. Varmista sijaintiluvat.";
          tulos.style.color = "red";
        },
        { enableHighAccuracy: true }
      );
    } else {
      tulos.textContent = "Selaimesi ei tue paikannusta.";
    }
  });
}

// --- 4. HAVAINNON TALLENNUS JA KUVIEN VESILEIMAUS (3 KUVAA) ---
document.getElementById("kasvi-lomake").addEventListener("submit", function(e) {
  e.preventDefault();

  const laji = document.getElementById("laji").value;
  const tieteellinen = document.getElementById("tieteellinen") ? document.getElementById("tieteellinen").value : "";
  const pvm = document.getElementById("pvm").value;
  const oppilas = document.getElementById("oppilas").value;
  const lat = document.getElementById("lat") ? document.getElementById("lat").value : "";
  const lng = document.getElementById("lng") ? document.getElementById("lng").value : "";
  
  localStorage.setItem("oppilaanNimi", oppilas);

  const kuva1 = document.getElementById("kuva-yleis").files[0];
  const kuva2 = document.getElementById("kuva-runko").files[0];
  const kuva3 = document.getElementById("kuva-lehti").files[0];

  const tallennaNappi = document.querySelector(".btn-tallenna");
  tallennaNappi.textContent = "Käsitellään kuvia...";
  tallennaNappi.disabled = true;

  // Vesileimataan kaikki 3 kuvaa samanaikaisesti
  Promise.all([
    prosessoiKuva(kuva1, oppilas),
    prosessoiKuva(kuva2, oppilas),
    prosessoiKuva(kuva3, oppilas)
  ]).then((kuvatBase64) => {
    
    const uusiHavainto = {
      laji: laji,
      tieteellinen: tieteellinen,
      pvm: pvm,
      oppilas: oppilas,
      sijainti: (lat && lng) ? `${lat}, ${lng}` : "Ei GPS-tietoa",
      kuvaYleis: kuvatBase64[0],
      kuvaRunko: kuvatBase64[1],
      kuvaLehti: kuvatBase64[2]
    };

    const transaction = db.transaction(["havainnot"], "readwrite");
    const store = transaction.objectStore("havainnot");
    const requestAdd = store.add(uusiHavainto);

    requestAdd.onsuccess = function() {
      document.getElementById("kasvi-lomake").reset();
      
      // Palautetaan nappi ja lomakkeen tiedot normaaleiksi
      tallennaNappi.textContent = "Tallenna havainto";
      tallennaNappi.disabled = false;
      const gpsTulos = document.getElementById("gps-tulos");
      if(gpsTulos) {
        gpsTulos.textContent = "Sijaintia ei haettu.";
        gpsTulos.style.color = "#666";
      }
      
      naytaKasvit();
      paivitaEdistyminen();
      alert("Kasvi tallennettu onnistuneesti puhelimesi muistiin!");
    };
  });
});

// Funktio, joka palauttaa Promisen: lukee, skaalaa ja vesileimaa yhden kuvan
function prosessoiKuva(tiedosto, oppilas) {
  return new Promise((resolve) => {
    if (!tiedosto) return resolve(null);

    const reader = new FileReader();
    reader.onloadend = function() {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const MAX_WIDTH = 1000;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const tarkkaAika = new Date().toLocaleString("fi-FI");
        const vesileimaTeksti = `${oppilas} | ${tarkkaAika}`;

        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, height - 50, width, 50);
        ctx.font = "bold 24px Arial";
        ctx.fillStyle = "white";
        ctx.fillText(vesileimaTeksti, 15, height - 17);

        resolve(canvas.toDataURL("image/jpeg", 0.7)); // Palautetaan pakattuna
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(tiedosto);
  });
}

// --- 5. TALLENNETTUJEN KASVIEN LISTAUS UI:HIN ---
function naytaKasvit() {
  const kasvilista = document.getElementById("kasvilista");
  if(!kasvilista) return;
  
  kasvilista.innerHTML = "";

  const transaction = db.transaction(["havainnot"], "readonly");
  const store = transaction.objectStore("havainnot");
  const requestCursor = store.openCursor();

  let onKasveja = false;

  requestCursor.onsuccess = function(e) {
    const cursor = e.target.result;
    if (cursor) {
      onKasveja = true;
      const havainto = cursor.value;

      const div = document.createElement("div");
      div.className = "kasvi-kortti";
      
      // Näytetään UI-listassa pelkkä yleiskuva esikatseluna
      const kuva = havainto.kuvaYleis || havainto.kuva; // Fallback jos vanhaa dataa
      
      div.innerHTML = `
        <img src="${kuva}" alt="${havainto.laji}" class="kasvi-kuva">
        <div class="kasvi-tiedot">
          <h3>${havainto.laji}</h3>
          <p>📍 ${havainto.sijainti || havainto.paikka}</p>
          <p>📅 ${havainto.pvm}</p>
        </div>
      `;
      kasvilista.appendChild(div);
      cursor.continue();
    } else if (!onKasveja) {
      kasvilista.innerHTML = '<p class="tyhja-viesti">Ei vielä tallennettuja kasveja. Lähde maastoon!</p>';
    }
  };
}

// --- 6. PDF:N LUONTI (WEB WORKER) ---
document.getElementById("btn-pdf").addEventListener("click", function() {
  const pdfNappi = document.getElementById("btn-pdf");
  
  const transaction = db.transaction(["havainnot"], "readonly");
  const store = transaction.objectStore("havainnot");
  const requestData = store.getAll();

  requestData.onsuccess = function() {
    const kaikkiHavainnot = requestData.result;
    if (kaikkiHavainnot.length === 0) {
      alert("Ei havaintoja PDF-raporttia varten.");
      return;
    }

    const alkuperainenTeksti = pdfNappi.textContent;
    pdfNappi.textContent = "⏳ Luodaan raporttia (Tämä voi kestää...)";
    pdfNappi.disabled = true;
    pdfNappi.style.backgroundColor = "#7f8c8d"; 

    // Oletetaan, että pdf-worker.js on samassa kansiossa!
    const worker = new Worker('pdf-worker.js');

    worker.postMessage({ havainnot: kaikkiHavainnot });

    worker.onmessage = function(e) {
      if (e.data.status === 'valmis') {
        const pdfBlob = e.data.blob;
        const tiedostonimi = e.data.tiedostonimi;

        const blobUrl = URL.createObjectURL(pdfBlob);

        const latausLinkki = document.createElement("a");
        latausLinkki.href = blobUrl;
        latausLinkki.download = tiedostonimi;
        document.body.appendChild(latausLinkki);
        latausLinkki.click();
        document.body.removeChild(latausLinkki);

        URL.revokeObjectURL(blobUrl);
        worker.terminate();

        pdfNappi.textContent = alkuperainenTeksti;
        pdfNappi.disabled = false;
        pdfNappi.style.backgroundColor = ""; 
      }
    };

    worker.onerror = function(err) {
      alert("Virhe PDF:n luonnissa. Tarkista konsoli. (Varmista, että käytät lokaalia palvelinta, ei file:// protokollaa)");
      console.error("Worker error:", err);
      pdfNappi.textContent = alkuperainenTeksti;
      pdfNappi.disabled = false;
    };
  };
});

// --- 7. SERVICE WORKER REKISTERÖINTI (OFFLINE-TUKI) ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log("SW virhe", err));
}
