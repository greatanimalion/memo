import { create } from "zustand";
interface AppStore {
  isBookScreen:boolean
  intoBookScreen:()=>void
  exitBookScreen:()=>void
}

const initialState = {
  isBookScreen:false
};

const useAppStore = create<AppStore>((set) => ({
  ...initialState,
  intoBookScreen:()=>{
    console.log(1111)
    set({isBookScreen:true})
  },
  exitBookScreen:()=>{
    set({isBookScreen:false})
  },

}));
export default useAppStore;
