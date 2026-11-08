const embedPDF = (id, url, height="800px") => {
  return `
<div id="${id}" style="width: 100%; height: ${height}; margin-bottom: 30px"></div>
 
<script type="module">
import EmbedPDF, { ZoomMode } from 'https://cdn.jsdelivr.net/npm/@embedpdf/snippet@2/dist/embedpdf.js';
 
EmbedPDF.init({
    type: 'container',
    target: document.getElementById('${id}'),
    src: '${url}',
    theme: { preference: 'system' },
    disabledCategories: ['annotation'],
    zoom: {
        defaultZoomLevel: ZoomMode.FitWidth
    }
});
</script>
  `;
};