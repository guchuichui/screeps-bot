var roleLink = {

    link: function (){


        const linkE =  Game.getObjectById('633287250eda730faf5ae081');
        const linkA =  Game.getObjectById('6300714617f6372a986ec083');
       
    

        //
        if(linkA.store.getFreeCapacity(RESOURCE_ENERGY)>1){
            linkE.transferEnergy(linkA);
        }
            
        
        
       
    },
    secondRoomLink: function(){

        const link_a = Game.getObjectById('638c838af28841c3b59a34bc');
        const link_b = Game.getObjectById('638c86acc874f71269bc6782');

        const link_top = Game.getObjectById('638738af6a3846a2c93a2a6f');
        if(link_top.store.getFreeCapacity(RESOURCE_ENERGY)>400){
            link_a.transferEnergy(link_top);
            link_b.transferEnergy(link_top);
        }

    },
    W55N13Link: function(){
        const link1838 = Game.getObjectById('6392cb9db6b679d263afa18e');
        const link2617 = Game.getObjectById('638c7e9760ce979b6471f27c');

        const link2636 = Game.getObjectById('63852f5b3d2699013b813de6');
        if(link2636.store.getUsedCapacity(RESOURCE_ENERGY) == 0){
             link2617.transferEnergy(link2636);
        }
        if(link2636.store.getUsedCapacity(RESOURCE_ENERGY) == 0){
            link1838.transferEnergy(link2636);
        }
        // const link2423 = Game.getObjectById('6352af0e80f0ef8e7303da8a');
        // if(link2423.store.getUsedCapacity(RESOURCE_ENERGY) == 0){
        //     link1838.transferEnergy(link2423);
        // }
    },

    W51N9Link: function(){
    //     const link2819 = Game.getObjectById('635bfd95fed71f27c0b962d0');        
    //     const link4426 = Game.getObjectById('635bf71793fe9f0dbe300bc4');

    //     const link2845 = Game.getObjectById('635c4ac037e8d987467a0778');

    //     if(link2819.store.getFreeCapacity(RESOURCE_ENERGY) == 0){
    //         link2819.transferEnergy(link2845);
    //     }
    //     if(link4426.store.getFreeCapacity(RESOURCE_ENERGY) == 0){
    //         link4426.transferEnergy(link2845);
    //    }
    }
    ,    
    W54N8Link: function(){
        const link364 = Game.getObjectById('63946f1505a1704b37dff39d');        
        const link1118 = Game.getObjectById('639478909361365bb498efbf');

        const link1123 = Game.getObjectById('63947f96602ae52725f188cb');

        if(link364.store.getFreeCapacity(RESOURCE_ENERGY) == 0){
            link364.transferEnergy(link1123);
        }
        if(link1118.store.getFreeCapacity(RESOURCE_ENERGY) == 0){
            link1118.transferEnergy(link1123);
       }
    },
    W54N9Link: function(){
    //     const link1425 = Game.getObjectById('635c0c83cee5ab2173256047');        
    //     const link3442 = Game.getObjectById('635c140bfb9c96997305d1db');

    //     const link3510 = Game.getObjectById('635c68bbc0516c863a8deceb');

    //     if(link1425.store.getFreeCapacity(RESOURCE_ENERGY) == 0){
    //         link1425.transferEnergy(link3510);
    //     }
    //     if(link3442.store.getFreeCapacity(RESOURCE_ENERGY) == 0){
    //         link3442.transferEnergy(link3510);
    //    }
    }

};
module.exports = roleLink;
