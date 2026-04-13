// Variable global y Panel de Configuración Modular
const esMovil = window.innerWidth <= 768;

const CONFIG = {
    archivos: {
        regiones: "https://fabmonge.github.io/Visualizacion_mapa/Ganadores_elecciones.csv",
        nacion: "https://fabmonge.github.io/Visualizacion_mapa/Resumen_eleccion_nacion.csv"
    },
    animacion: {
        velocidad: 3000
    },
    colores: {
        defecto: "#eeeeee"
    }
};

const map = L.map('map', {
    zoomControl: false, 
    dragging: false, 
    scrollWheelZoom: false,
    doubleClickZoom: false, 
    touchZoom: false, 
    boxZoom: false,       // <-- Añadir esto
    keyboard: false,      // <-- Añadir esto
    attributionControl: false, 
    zoomSnap: 0 
}).setView(
    esMovil ? [-11.0, -75.0] : [-10.0, -76.5], 
    esMovil ? 4.5 : 5.55                     
);

let elecciones = {}, periodos = [], currentIndex = 0;
let geoJsonLayer, callaoInset, pexLayer;
let timerInterval, isPlaying = true;

const generarLabel = (anio) => `${String(anio).trim()} - 2da Vuelta`;

const getStyle = (name) => {
    const n = name ? name.toUpperCase().trim() : "";
    const elec = elecciones[periodos[currentIndex]];
    const fillColor = (elec && elec.mapa[n]) ? elec.mapa[n].color : CONFIG.colores.defecto;
    return { fillColor: fillColor, weight: 0.8, opacity: 1, color: "#444444", fillOpacity: 1 };
};

function onEachFeature(feature, layer) {
    let n = feature?.properties?.NOMBDEP ? feature.properties.NOMBDEP.toUpperCase().trim() : "CALLAO";
    let anioActual = periodos[currentIndex];
    let currentElec = elecciones[anioActual];
    
    if (currentElec && currentElec.mapa[n]) {
        let d = currentElec.mapa[n];
        layer.bindPopup(`
            <div class="popup-region">${n}</div>
            <div class="popup-party">${d.partido}</div>
            <div class="popup-pct">${d.pct} <span class="popup-pct-label">(votos válidos)</span></div>
        `, { closeButton: false });
    }
}

function createCard(cand, anio) {
    if (!cand || !cand.nombre) return '';
    const bgImage = `background-image: url('https://fabmonge.github.io/Visualizacion_mapa/fotos/${cand.idFoto}_${anio}.png'), url('https://fabmonge.github.io/Visualizacion_mapa/fotos/${cand.idFoto}.png'); background-size: cover; background-position: center center;`;
    const dotHtml = cand.color ? `<div class="dot" style="background:${cand.color};"></div>` : '';

    return `
        <div class="photo" style="${bgImage}"></div>
        <div class="cand-info-container">
            <span class="cand-name">${cand.nombre}</span>
            <span class="cand-party">${cand.partido}</span>
            <div class="cand-pct">
                ${dotHtml}
                <span>${cand.pct}</span>
            </div>
        </div>
    `;
}

function updateLegend() {
    const currentData = elecciones[periodos[currentIndex]];
    if (!currentData) return;
    const anioActual = periodos[currentIndex].split(' - ')[0];
    
    document.getElementById("cand-1").innerHTML = currentData.candidatos[0] ? createCard(currentData.candidatos[0], anioActual) : '';
    document.getElementById("cand-2").innerHTML = currentData.candidatos[1] ? createCard(currentData.candidatos[1], anioActual) : '';
}

// Inicialización con Fail-Safes y FILTRO DE 2DA VUELTA
Promise.all([
    new Promise(res => Papa.parse(CONFIG.archivos.regiones, { download: true, header: true, skipEmptyLines: true, delimiter: ";", transformHeader: h => h.replace(/^\uFEFF/, '').trim().toLowerCase(), complete: res })),
    new Promise(res => Papa.parse(CONFIG.archivos.nacion, { download: true, header: true, skipEmptyLines: true, delimiter: ";", transformHeader: h => h.replace(/^\uFEFF/, '').trim().toLowerCase(), complete: res }))
]).then(results => {
    const [regionesData, nacionData] = results;

    nacionData.data.forEach(row => {
        const anio = row['año'] || row['ano'] || Object.values(row)[0];
        const puestoRaw = (row['puesto'] || "").toUpperCase().trim();
        const vueltaRaw = String(row['vuelta'] || "").toLowerCase();
        
        // FILTRO ESTRICTO: Solo dejamos pasar las filas de "segunda vuelta"
        if (!anio || !row['candidato'] || !puestoRaw || !vueltaRaw.includes('segunda')) return; 

        const label = generarLabel(anio);
        if (!elecciones[label]) elecciones[label] = { mapa: {}, candidatos: [] };

        const nombreLimpio = row['candidato'].trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, '').replace(/\s+/g, '_');
        const idx = ['PRIMERO', 'SEGUNDO'].indexOf(puestoRaw); // En balotaje solo importan el 1ro y 2do
        
        if (idx !== -1) {
            elecciones[label].candidatos[idx] = { 
                nombre: row['candidato'].trim(), 
                partido: (row['organización política'] || row['organizacion politica'] || "").trim(), 
                pct: row['%_votos_validos'] || "", 
                color: (row['color'] || "").trim(),
                idFoto: nombreLimpio
            };
        }
    });

    regionesData.data.forEach(row => {
        const anio = row['año'] || row['ano'] || Object.values(row)[0];
        let region = row["distrito electoral"];
        const vueltaRaw = String(row['vuelta'] || "").toLowerCase();
        
        // FILTRO ESTRICTO: Solo segunda vuelta
        if (!anio || !region || !vueltaRaw.includes('segunda')) return; 

        const label = generarLabel(anio);
        if (!elecciones[label]) elecciones[label] = { mapa: {}, candidatos: [] };
        
        region = region.toUpperCase().trim();
        if (region.includes("EXTRANJERO")) region = "EXTRANJERO";

        elecciones[label].mapa[region] = { 
            color: (row['color'] || "").trim() || CONFIG.colores.defecto, 
            partido: (row["organización política"] || row["organizacion politica"] || "").trim(), 
            pct: row["%_votos_validos"] || "" 
        };
    });

    periodos = Object.keys(elecciones).sort();
    if (periodos.length === 0) return document.getElementById("year-display").innerText = "Sin datos 2da Vuelta";

    fetch("https://fabmonge.github.io/Visualizacion_mapa/mapa.geojson?v=" + Date.now()).then(res => res.json()).then(data => {
        geoJsonLayer = L.geoJSON(data, { style: f => getStyle(f.properties.NOMBDEP), onEachFeature: onEachFeature }).addTo(map);

        const callaoF = data.features.find(f => f.properties.NOMBDEP === "CALLAO");
        if (callaoF) {
            let callaoGeom = JSON.parse(JSON.stringify(callaoF.geometry));
            const shift = [-82.5, -11.5], scale = 12, center = [-77.12, -12.05];
            callaoGeom.coordinates = (function transform(coords) { return Array.isArray(coords[0]) ? coords.map(transform) : [shift[0] + (coords[0] - center[0]) * scale, shift[1] + (coords[1] - center[1]) * scale]; })(callaoGeom.coordinates);
            callaoInset = L.geoJSON(callaoGeom, { style: getStyle("CALLAO"), onEachFeature: onEachFeature }).addTo(map);
            L.polyline([[-10.8, -82.2], [-12.05, -77.50]], { color: "#444", weight: 1.2, dashArray: "5, 5" }).addTo(map);
            L.marker([-8.5, -82.75], { icon: L.divIcon({ className: 'pex-label', html: 'CALLAO', iconSize: [100, 20], iconAnchor: [50, 10] }), interactive: false }).addTo(map);
        }

        const coordMundito = esMovil ? [-17.5, -81.5] : [-16.0, -81.5]; 
        const coordPopupMundito = esMovil ? [-18.2, -81.5] : [-14.7, -81.5];

        pexLayer = L.marker(coordMundito, { icon: L.divIcon({ className: 'pex-globe-container', html: '<div class="pex-globe"></div><div class="pex-label">Peruanos en<br>el extranjero</div>', iconSize: [120, 100], iconAnchor: [60, 50] }) }).addTo(map);
        
        pexLayer.on('click', () => {
            let d = elecciones[periodos[currentIndex]]?.mapa["EXTRANJERO"];
            if (d) L.popup().setLatLng(coordPopupMundito).setContent(`<div class="popup-region">EXTRANJERO</div><div class="popup-party">${d.partido}</div><div class="popup-pct">${d.pct} <span class="popup-pct-label">(votos válidos)</span></div>`).openOn(map);
        });

        actualizarPantalla();
        iniciarAnimacion();
    });
}).catch(error => {
    console.error("Error cargando datos:", error);
    document.getElementById("year-display").innerText = "⚠️ Error cargando datos.";
});

function actualizarPantalla() {
    document.getElementById("year-display").innerText = periodos[currentIndex];
    geoJsonLayer.setStyle(layerFeature => getStyle(layerFeature.properties.NOMBDEP));
    geoJsonLayer.eachLayer(layer => onEachFeature(layer.feature, layer));
    if (callaoInset) callaoInset.setStyle(getStyle("CALLAO"));
    
    let globe = pexLayer?.getElement()?.querySelector('.pex-globe');
    if (globe) {
        let currentElec = elecciones[periodos[currentIndex]];
        let d = currentElec ? currentElec.mapa["EXTRANJERO"] : null;
        globe.style.backgroundColor = (d && d.color && d.color !== CONFIG.colores.defecto) ? d.color : 'transparent';
    }
    updateLegend();
}

const btnPlayPause = document.getElementById("play-pause-btn");
const btnPrev = document.getElementById("prev-btn");
const btnNext = document.getElementById("next-btn");
const btnRestart = document.getElementById("restart-btn");

function avanzarFrame() { currentIndex = (currentIndex + 1) % periodos.length; actualizarPantalla(); }
function retrocederFrame() { currentIndex = (currentIndex - 1 + periodos.length) % periodos.length; actualizarPantalla(); }

function iniciarAnimacion() { 
    timerInterval = setInterval(avanzarFrame, CONFIG.animacion.velocidad); 
    isPlaying = true; btnPlayPause.innerHTML = "⏸"; 
    btnPrev.disabled = true; btnNext.disabled = true;
}

function pausarAnimacion() { 
    clearInterval(timerInterval); 
    isPlaying = false; btnPlayPause.innerHTML = "▶"; 
    btnPrev.disabled = false; btnNext.disabled = false;
}

btnPlayPause.addEventListener("click", () => isPlaying ? pausarAnimacion() : iniciarAnimacion());
btnNext.addEventListener("click", () => { if (!isPlaying) avanzarFrame(); });
btnPrev.addEventListener("click", () => { if (!isPlaying) retrocederFrame(); });

btnRestart.addEventListener("click", () => {
    currentIndex = 0; actualizarPantalla();
    if (!isPlaying) iniciarAnimacion();
    else { clearInterval(timerInterval); timerInterval = setInterval(avanzarFrame, CONFIG.animacion.velocidad); }
});