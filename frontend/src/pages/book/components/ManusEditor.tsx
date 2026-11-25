import useAppStore from "@renderer/store/app";
import EditorArea from "./EditorArea";
import RightPanel from "./RightPanel";

export function ManusEditor() {
    const appStore = useAppStore()

    return (
        <>
            <EditorArea />
            <RightPanel isBookScreen={appStore.isBookScreen} />
        </>
    )
}