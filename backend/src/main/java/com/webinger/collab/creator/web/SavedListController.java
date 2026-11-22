package com.webinger.collab.creator.web;

import com.webinger.collab.creator.service.CreatorInputs.SavedListInput;
import com.webinger.collab.creator.service.SavedListService;
import com.webinger.collab.creator.web.CreatorDtos.SavedListDetailDto;
import com.webinger.collab.creator.web.CreatorDtos.SavedListDto;
import com.webinger.collab.security.AuthUser;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Saved lists (FR-25, v2.5): a brand's shortlists of creators. */
@RestController
@RequestMapping("/lists")
public class SavedListController {
    private final SavedListService lists;

    public SavedListController(SavedListService lists) {
        this.lists = lists;
    }

    @GetMapping
    public List<SavedListDto> list(@AuthenticationPrincipal AuthUser me) {
        return lists.list(me);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SavedListDto create(@AuthenticationPrincipal AuthUser me, @RequestBody SavedListInput body) {
        return lists.create(me, body);
    }

    @GetMapping("/{listId}")
    public SavedListDetailDto get(@AuthenticationPrincipal AuthUser me, @PathVariable String listId) {
        return lists.get(me, listId);
    }

    @PatchMapping("/{listId}")
    public SavedListDto rename(@AuthenticationPrincipal AuthUser me, @PathVariable String listId, @RequestBody SavedListInput body) {
        return lists.rename(me, listId, body);
    }

    @DeleteMapping("/{listId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthUser me, @PathVariable String listId) {
        lists.delete(me, listId);
    }

    @PutMapping("/{listId}/creators/{username}")
    public SavedListDto add(@AuthenticationPrincipal AuthUser me, @PathVariable String listId, @PathVariable String username) {
        return lists.add(me, listId, username);
    }

    @DeleteMapping("/{listId}/creators/{username}")
    public SavedListDto remove(@AuthenticationPrincipal AuthUser me, @PathVariable String listId, @PathVariable String username) {
        return lists.remove(me, listId, username);
    }
}
