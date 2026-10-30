<script lang="ts">
    /** Fixture for `srv-capture.test.ts`, compiled WITH the transform. */
    import { Translate } from '$lib/index.js';

    const load = () => new Promise<string>(() => {});
</script>

<Translate category="SRV5" tag="div"
    ><p>Depth one</p>
    <Translate tag="div"
        ><p>Depth two</p>
        <Translate tag="div"><p id="deepest">Depth three</p></Translate></Translate
    ></Translate
>
<Translate category="SRV5" tag="div"><p id="awaiting">{#await load()}Loading…{:then text}{text}{/await}</p></Translate>
