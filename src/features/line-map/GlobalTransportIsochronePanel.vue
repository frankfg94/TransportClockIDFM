<script lang="ts">
// Compatibility entry point for existing imports. The implementation now
// lives with the shared transport-map isochrone contract so nearby-stations
// and the global map render exactly the same controls.
import TransportIsochronePanel from "../transport-map/isochrones/TransportIsochronePanel.vue";

export default TransportIsochronePanel;
</script>
