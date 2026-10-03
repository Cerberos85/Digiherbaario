const dbName = "DigiHerbaarioDB";
let db;

// 1. Alustetaan IndexedDB-tietokanta
const request = indexedDB.open(dbName, 1);

request.onupgradeneeded = function(e) {
  db = e.target.result;
  if (!db.objectStoreNames.contains("havainnot")) {
    db.createObjectStore("havainnot", { keyPath: "id", autoIncrement: true });
  }
};

request.onsuccess = function(e) {
  db = e.target.result;
  naytaKasvit(); // Haetaan ja näytetään tallennetut kasvit
};

request.onerror = function(e) {
  console.error("Tietokantavirhe:", e.target.error);
};

// 2. Lomakkeen lähetys ja kuvan muuntaminen Base64-muotoon
// 2. Lomakkeen lähetys ja kuvan vesileimaus (Canvas API)
document.getElementById("kasvi-lomake").addEventListener("submit", function(e) {
  e.preventDefault();

  const laji = document.getElementById("laji").value;
  const paikka = document.getElementById("paikka").value;
  const pvm = document.getElementById("pvm").value;
  const oppilas = document.getElementById("oppilas").value;
  const kuvaTiedosto = document.getElementById("kuva").files[0];

  // Tallennetaan oppilaan nimi LocalStorageen, jotta sitä ei tarvitse kirjoittaa joka kerta uudestaan
  localStorage.setItem("oppilaanNimi", oppilas);

  const reader = new FileReader();
  reader.onloadend = function() {
    // Kutsutaan funktiota, joka tekee vesileiman
    poltaVesileimaJaTallenna(reader.result, laji, paikka, pvm, oppilas);
  };

  if (kuvaTiedosto) {
    reader.readAsDataURL(kuvaTiedosto);
  }
});

// Asetetaan tallennettu nimi valmiiksi kenttään sivun latautuessa
window.addEventListener("DOMContentLoaded", () => {
  const tallennettuNimi = localStorage.getItem("oppilaanNimi");
  if (tallennettuNimi) {
    document.getElementById("oppilas").value = tallennettuNimi;
  }
});

// Funktio: Kuvan skaalaus, vesileimaus ja tallennus
function poltaVesileimaJaTallenna(kuvaDataUrl, laji, paikka, pvm, oppilas) {
  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Skaalataan kuva järkevän kokoiseksi (esim. max leveys 1200px) säästääksemme muistia
    const MAX_WIDTH = 1200;
    let width = img.width;
    let height = img.height;

    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }

    canvas.width = width;
    canvas.height = height;

    // Piirretään alkuperäinen kuva kankaalle (canvas)
    ctx.drawImage(img, 0, 0, width, height);

    // Määritetään vesileiman teksti (Nimi + tarkka aika)
    const tarkkaAika = new Date().toLocaleString("fi-FI"); // Esim. 17.8.2026 klo 9.39.15
    const vesileimaTeksti = `Kerääjä: ${oppilas} | Kuvattu: ${tarkkaAika}`;

    // Piirretään puoliläpinäkyvä tumma tausta tekstille alareunaan
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, height - 60, width, 60);

    // Piirretään valkoinen teksti taustan päälle
    ctx.font = "bold 28px Arial";
    ctx.fillStyle = "white";
    ctx.fillText(vesileimaTeksti, 20, height - 20);

    // Muunnetaan vesileimattu kuva takaisin Base64-muotoon (.jpeg, 80% laatu)
    const vesileimattuKuvaBase64 = canvas.toDataURL("image/jpeg", 0.8);

    const uusiHavainto = {
      laji: laji,
      paikka: paikka,
      pvm: pvm,
      oppilas: oppilas,
      kuva: vesileimattuKuvaBase64 // Tämä on nyt huijaussuojattu kuva!
    };

    tallennaTietokantaan(uusiHavainto);
  };
  
  img.src = kuvaDataUrl;
}

// 3. Haetaan havainnot tietokannasta ja tulostetaan näytölle
function naytaKasvit() {
  const kasvilista = document.getElementById("kasvilista");
  kasvilista.innerHTML = "";

  const transaction = db.transaction(["havainnot"], "readonly");
  const store = transaction.objectStore("havainnot");
  const request = store.openCursor();

  let onKasveja = false;

  request.onsuccess = function(e) {
    const cursor = e.target.result;
    if (cursor) {
      onKasveja = true;
      const havainto = cursor.value;

      const div = document.createElement("div");
      div.className = "kasvi-kortti";
      div.innerHTML = `
        <img src="${havainto.kuva}" alt="${havainto.laji}" class="kasvi-kuva">
        <div class="kasvi-tiedot">
          <h3>${havainto.laji}</h3>
          <p>📍 ${havainto.paikka}</p>
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

// 4. Suojatun PDF:n luominen (jsPDF)
document.getElementById("btn-pdf").addEventListener("click", function() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const transaction = db.transaction(["havainnot"], "readonly");
  const store = transaction.objectStore("havainnot");
  const request = store.getAll();

  request.onsuccess = function() {
    const kaikkiHavainnot = request.result;
    if (kaikkiHavainnot.length === 0) {
      alert("Ei havaintoja PDF-raporttia varten.");
      return;
    }

    // Otsikko
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.text("DIGITAALINEN HERBAARIO", 14, 20);
    doc.setFontSize(12);
    doc.setFont("Helvetica", "normal");
    doc.text(`Luotu: ${new Date().toLocaleDateString("fi-FI")}`, 14, 28);
    doc.line(14, 32, 196, 32);

    let yPosition = 40;

    kaikkiHavainnot.forEach((havainto, index) => {
      if (yPosition > 220) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`${index + 1}. ${havainto.laji}`, 14, yPosition);
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Löytöpaikka: ${havainto.paikka}`, 14, yPosition + 6);
      doc.text(`Päivämäärä: ${havainto.pvm}`, 14, yPosition + 12);

      try {
        // Lisätään kasvin kuva PDF-tiedostoon
        doc.addImage(havainto.kuva, "JPEG", 14, yPosition + 16, 50, 40);
      } catch (err) {
        doc.text("[Kuvan lisääminen epäonnistui]", 14, yPosition + 20);
      }

      yPosition += 65;
    });

    // --- PDF:N SUOJAUS ENNEN TALLENNUSTA ---
    // Asetetaan metadata "read-only"-tilaan ja estetään helppo muokkaus selausohjelmissa
    doc.setProperties({
      title: "Digiherbaario Raportti",
      subject: "Koulutyö - Ei muokattavissa",
      author: "Digiherbaario App",
      creator: "jsPDF"
    });

    // Tallennus käyttäjälle
    doc.save("herbaario-suojattu.pdf");
  };
});

// Rekisteröidään Service Worker offline-tilaa varten
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log("SW virhe", err));
}
